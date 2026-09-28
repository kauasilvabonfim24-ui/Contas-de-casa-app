import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return session ? <Painel email={session.user.email ?? ""} /> : <Entrar />;
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

function Painel({ email }: { email: string }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ descricao: "", valor: "", vencimento: new Date().toISOString().slice(0, 10), categoria: "Moradia" });
  const [pessoas, setPessoas] = useState(1);
  const [salvarModo, setSalvarModo] = useState<"total" | "parte">("parte");

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
  const hoje = new Date().toISOString().slice(0, 10);

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
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Mês</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-1.5" />
        </div>
        <section className="grid grid-cols-3 gap-3">
          {[["Total", total], ["Pago", pago], ["A pagar", total - pago]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="font-display text-lg font-bold text-primary">{brl(v as number)}</p>
            </div>
          ))}
        </section>
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
      </div>
    </main>
  );
}
