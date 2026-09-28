import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toPng } from "html-to-image";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Casa em Dia — Contas de casa e controle" },
      { name: "description", content: "Organize as contas da sua casa: vencimentos, valores e o que já foi pago." },
      { property: "og:title", content: "Casa em Dia — Contas de casa e controle" },
      { property: "og:description", content: "Organize as contas da sua casa: vencimentos, valores e o que já foi pago." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Conta = {
  id: string; descricao: string; valor: number; vencimento: string; categoria: string; pago: boolean;
};
const CATEGORIAS = ["Moradia", "Energia", "Água", "Internet", "Mercado", "Transporte", "Saúde", "Outros"];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesLabel = (mesIso: string) => {
  const [y, m] = mesIso.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return session ? <Painel email={session.user.email ?? ""} nome={session.user.user_metadata?.name as string | undefined} /> : <Entrar />;
}

function Entrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState("");
  async function enviar(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setMsg("E-mail ou senha incorretos.");
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-primary">Casa em Dia</h1>
        <p className="mt-1 text-sm text-muted-foreground">Contas de casa e controle</p>
        <form onSubmit={enviar} className="mt-6 space-y-3">
          <input className="w-full rounded-lg border border-input bg-background px-3 py-2" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded-lg border border-input bg-background px-3 py-2" type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          <button className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground">Entrar</button>
        </form>
        {msg && <p className="mt-3 text-sm text-destructive">{msg}</p>}
      </div>
    </main>
  );
}

function Painel({ email, nome }: { email: string; nome?: string }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ descricao: "", valor: "", vencimento: new Date().toISOString().slice(0, 10), categoria: "Moradia" });
  const [pessoas, setPessoas] = useState(1);
  const [salvarModo, setSalvarModo] = useState<"total" | "parte">("parte");
  const [aba, setAba] = useState<"contas" | "historico">("contas");
  const [mostrarComprovante, setMostrarComprovante] = useState(false);

  const valorNum = Number(form.valor) || 0;
  const porPessoa = pessoas > 1 ? valorNum / pessoas : valorNum;

  async function carregar() {
    const [y, m] = mes.split("-").map(Number) as [number, number];
    const fim = new Date(y, m, 0).getDate();
    const { data } = await supabase.from("contas").select("*")
      .gte("vencimento", `${mes}-01`).lte("vencimento", `${mes}-${String(fim).padStart(2, "0")}`)
      .order("vencimento");
    setContas((data ?? []).map((c) => ({ ...c, valor: Number(c.valor) })));
  }
  useEffect(() => { carregar(); }, [mes]);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    const dividida = pessoas > 1;
    const valorFinal = dividida && salvarModo === "parte" ? porPessoa : valorNum;
    const descricao = dividida && salvarModo === "total"
      ? `${form.descricao} (${brl(porPessoa)}/pessoa × ${pessoas})`
      : form.descricao;
    await supabase.from("contas").insert({ descricao, valor: Math.round(valorFinal * 100) / 100, vencimento: form.vencimento, categoria: form.categoria });
    setForm({ ...form, descricao: "", valor: "" });
    setPessoas(1);
    carregar();
  }
  async function alternar(c: Conta) { await supabase.from("contas").update({ pago: !c.pago }).eq("id", c.id); carregar(); }
  async function remover(id: string) { await supabase.from("contas").delete().eq("id", id); carregar(); }

  const total = contas.reduce((s, c) => s + c.valor, 0);
  const pago = contas.filter((c) => c.pago).reduce((s, c) => s + c.valor, 0);
  const pendente = total - pago;
  const hoje = new Date().toISOString().slice(0, 10);
  const qtdPagas = contas.filter((c) => c.pago).length;
  const qtdPendentes = contas.length - qtdPagas;

  return (
    <main className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-2xl font-bold">Casa em Dia</h1>
            <p className="text-xs opacity-80">{email}</p>
          </div>
          <button className="rounded-lg border border-primary-foreground/30 px-3 py-1 text-sm" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Mês</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-1.5" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAba("contas")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${aba === "contas" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Contas</button>
            <button onClick={() => setAba("historico")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${aba === "historico" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Histórico</button>
          </div>
        </div>

        {aba === "historico" ? (
          <Historico mesAtual={mes} />
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3">
              {[["Total", total], ["Pago", pago], ["A pagar", pendente]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{l}</p>
                  <p className="font-display text-lg font-bold text-primary">{brl(v as number)}</p>
                </div>
              ))}
            </section>

            <button
              onClick={() => setMostrarComprovante(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-sm"
            >
              Compartilhar resumo do mês
            </button>

            <form onSubmit={adicionar} className="grid grid-cols-2 gap-2 rounded-xl bg-card p-4 shadow-sm sm:grid-cols-5">
              <input required placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="col-span-2 rounded-lg border border-input bg-background px-3 py-2" />
              <input required type="number" step="0.01" min="0" placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2" />
              <input required type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2" />
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2">
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-5">
                <label className="text-sm text-muted-foreground">Dividir por</label>
                <select value={pessoas} onChange={(e) => setPessoas(Number(e.target.value))} className="rounded-lg border border-input bg-background px-3 py-1.5" aria-label="Número de pessoas">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n === 1 ? "Não dividir" : `${n} pessoas`}</option>)}
                </select>
                {pessoas > 1 && valorNum > 0 && (
                  <p className="text-sm font-semibold text-primary">{brl(porPessoa)} por pessoa</p>
                )}
              </div>
              {pessoas > 1 && valorNum > 0 && (
                <div className="col-span-2 flex gap-2 sm:col-span-5">
                  <button type="button" onClick={() => setSalvarModo("parte")} className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${salvarModo === "parte" ? "border-primary bg-primary/10 font-semibold text-primary" : "border-input text-muted-foreground"}`}>
                    Salvar só minha parte ({brl(porPessoa)})
                  </button>
                  <button type="button" onClick={() => setSalvarModo("total")} className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${salvarModo === "total" ? "border-primary bg-primary/10 font-semibold text-primary" : "border-input text-muted-foreground"}`}>
                    Salvar total ({brl(valorNum)})
                  </button>
                </div>
              )}
              <button className="col-span-2 rounded-lg bg-accent py-2 font-semibold text-accent-foreground sm:col-span-5">Adicionar conta</button>
            </form>
            <ul className="space-y-2">
              {contas.length === 0 && <li className="text-center text-sm text-muted-foreground">Nenhuma conta neste mês.</li>}
              {contas.map((c) => {
                const atrasada = !c.pago && c.vencimento < hoje;
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-sm">
                    <input type="checkbox" checked={c.pago} onChange={() => alternar(c)} className="h-5 w-5 accent-primary" aria-label="Marcar como paga" />
                    <div className="flex-1">
                      <p className={c.pago ? "text-muted-foreground line-through" : "font-medium"}>{c.descricao}</p>
                      <p className={`text-xs ${atrasada ? "text-destructive" : "text-muted-foreground"}`}>
                        {c.categoria} · vence {c.vencimento.split("-").reverse().join("/")}{atrasada && " · atrasada"}
                      </p>
                    </div>
                    <p className="font-semibold">{brl(c.valor)}</p>
                    <button onClick={() => remover(c.id)} className="text-sm text-muted-foreground hover:text-destructive" aria-label="Excluir">✕</button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {mostrarComprovante && (
        <Comprovante
          mes={mes}
          nome={nome || email.split("@")[0]}
          total={total}
          pago={pago}
          pendente={pendente}
          qtdPagas={qtdPagas}
          qtdPendentes={qtdPendentes}
          onFechar={() => setMostrarComprovante(false)}
        />
      )}
    </main>
  );
}

/** Comprovante estilo recibo Pix, gerado como imagem para compartilhar. */
function Comprovante({
  mes, nome, total, pago, pendente, qtdPagas, qtdPendentes, onFechar,
}: {
  mes: string; nome: string; total: number; pago: number; pendente: number;
  qtdPagas: number; qtdPendentes: number; onFechar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  async function compartilhar() {
    if (!ref.current) return;
    setErro(""); setGerando(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `resumo-${mes}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: "Resumo do mês", text: `Resumo de ${mesLabel(mes)} — Casa em Dia` });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl; link.download = file.name; link.click();
      }
    } catch {
      setErro("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  const agora = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm">
        <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-xl">
          <div className="bg-primary px-5 py-6 text-center text-primary-foreground">
            <p className="text-xs opacity-80">Resumo financeiro</p>
            <p className="text-lg font-bold">{mesLabel(mes)}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">Emitido por</p>
            <p className="mb-3 font-semibold">{nome} · Casa em Dia</p>
            <div className="mb-3 border-t border-dashed border-input" />
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Total do mês</dt><dd className="font-medium">{brl(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Pago</dt><dd className="font-medium text-primary">{brl(pago)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">A pagar</dt><dd className="font-medium text-destructive">{brl(pendente)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Contas pagas</dt><dd>{qtdPagas}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Contas pendentes</dt><dd>{qtdPendentes}</dd></div>
            </dl>
            <div className="my-3 border-t border-dashed border-input" />
            <p className="text-center text-[11px] text-muted-foreground">Gerado em {agora} · Casa em Dia</p>
          </div>
        </div>

        {erro && <p className="mt-2 text-center text-sm text-destructive">{erro}</p>}

        <div className="mt-3 flex gap-2">
          <button onClick={onFechar} className="flex-1 rounded-lg border border-input bg-card py-2.5 font-medium">Fechar</button>
          <button onClick={compartilhar} disabled={gerando} className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
            {gerando ? "Gerando…" : "Compartilhar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Gráfico simples (SVG, sem dependências) do total e do pago nos últimos 6 meses. */
function Historico({ mesAtual }: { mesAtual: string }) {
  const [pontos, setPontos] = useState<{ mes: string; total: number; pago: number }[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const [y, m] = mesAtual.split("-").map(Number) as [number, number];
      const inicio = new Date(y, m - 6, 1);
      const inicioIso = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
      const fimData = new Date(y, m, 0);
      const fimIso = `${fimData.getFullYear()}-${String(fimData.getMonth() + 1).padStart(2, "0")}-${String(fimData.getDate()).padStart(2, "0")}`;

      const { data } = await supabase.from("contas").select("valor, vencimento, pago")
        .gte("vencimento", inicioIso).lte("vencimento", fimIso);

      const meses: { mes: string; total: number; pago: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(y, m - 1 - i, 1);
        meses.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, total: 0, pago: 0 });
      }
      for (const c of data ?? []) {
        const chave = c.vencimento.slice(0, 7);
        const alvo = meses.find((p) => p.mes === chave);
        if (!alvo) continue;
        alvo.total += Number(c.valor);
        if (c.pago) alvo.pago += Number(c.valor);
      }
      setPontos(meses);
      setCarregando(false);
    })();
  }, [mesAtual]);

  if (carregando) return <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">Carregando histórico…</div>;

  const max = Math.max(1, ...pontos.map((p) => p.total));
  const media = pontos.reduce((s, p) => s + p.total, 0) / (pontos.length || 1);
  const nomesMes = pontos.map((p) => {
    const [, mm] = p.mes.split("-").map(Number);
    return new Date(2000, mm - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-primary" />Total do mês</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-accent" />Pago</span>
        </div>
        <div className="flex h-40 items-end gap-3">
          {pontos.map((p, i) => (
            <div key={p.mes} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-32 w-full items-end justify-center gap-1">
                <div className="w-1/2 rounded-t bg-primary/25" style={{ height: `${(p.total / max) * 100}%` }} title={brl(p.total)} />
                <div className="w-1/2 rounded-t bg-primary" style={{ height: `${(p.pago / max) * 100}%` }} title={brl(p.pago)} />
              </div>
              <span className="text-[11px] text-muted-foreground">{nomesMes[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-sm">
        <span className="text-xs text-muted-foreground">Média de contas por mês</span>
        <span className="font-semibold text-primary">{brl(media)}</span>
      </div>
    </div>
  );
}
