import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

type Item = { id: string; nome: string; preco: number; categoria: string; qtd: number; comprado: boolean };

const CATEGORIAS = ["Grãos e massas", "Carnes e ovos", "Hortifruti", "Laticínios", "Bebidas", "Padaria", "Limpeza", "Higiene", "Outros"];
const CHAVE_ORCAMENTO = "casa-em-dia:orcamento-mercado";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const arred = (n: number) => Math.round(n * 100) / 100;
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function Mercado({ onLancado }: { onLancado: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [form, setForm] = useState({ nome: "", preco: "", categoria: "Grãos e massas" });
  const [busca, setBusca] = useState("");
  const [ver, setVer] = useState<"lista" | "todos">("todos");
  const [pessoas, setPessoas] = useState(1);
  const [orcamento, setOrcamento] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [precoEdit, setPrecoEdit] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try { setOrcamento(localStorage.getItem(CHAVE_ORCAMENTO) ?? ""); } catch { /* ignora */ }
    carregar(true);
  }, []);

  function mudarOrcamento(v: string) {
    setOrcamento(v);
    try { localStorage.setItem(CHAVE_ORCAMENTO, v); } catch { /* ignora */ }
  }

  async function carregar(primeira = false) {
    const { data } = await supabase.from("mantimentos").select("*").order("categoria").order("nome");
    const lista: Item[] = (data ?? []).map((i) => ({ ...i, preco: Number(i.preco) }));
    setItens(lista);
    if (primeira && lista.some((i) => i.qtd > 0)) setVer("lista");
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const nome = form.nome.trim();
    const preco = Number(form.preco);
    if (!nome || !(preco >= 0)) return;
    const { error } = await supabase.from("mantimentos").insert({ nome, preco: arred(preco), categoria: form.categoria });
    if (error) { setMsg("Não foi possível salvar o produto. Tente novamente."); return; }
    setForm({ ...form, nome: "", preco: "" });
    carregar();
  }

  async function mudarQtd(item: Item, delta: number) {
    const qtd = Math.max(0, item.qtd + delta);
    if (qtd === item.qtd) return;
    const comprado = qtd === 0 ? false : item.comprado;
    setItens((atual) => (atual ?? []).map((i) => (i.id === item.id ? { ...i, qtd, comprado } : i)));
    await supabase.from("mantimentos").update({ qtd, comprado }).eq("id", item.id);
  }

  async function alternarComprado(item: Item) {
    if (item.qtd === 0) return;
    const comprado = !item.comprado;
    setItens((atual) => (atual ?? []).map((i) => (i.id === item.id ? { ...i, comprado } : i)));
    await supabase.from("mantimentos").update({ comprado }).eq("id", item.id);
  }

  async function salvarPreco(item: Item) {
    const preco = Number(precoEdit);
    setEditando(null);
    if (precoEdit === "" || !(preco >= 0) || arred(preco) === item.preco) return;
    const novo = arred(preco);
    setItens((atual) => (atual ?? []).map((i) => (i.id === item.id ? { ...i, preco: novo } : i)));
    await supabase.from("mantimentos").update({ preco: novo }).eq("id", item.id);
  }

  async function remover(item: Item) {
    if (!window.confirm(`Excluir "${item.nome}" dos produtos?`)) return;
    setItens((atual) => (atual ?? []).filter((i) => i.id !== item.id));
    await supabase.from("mantimentos").delete().eq("id", item.id);
  }

  async function limparLista() {
    if (!window.confirm("Limpar a lista de compras? Os produtos e preços continuam salvos.")) return;
    setItens((atual) => (atual ?? []).map((i) => ({ ...i, qtd: 0, comprado: false })));
    await supabase.from("mantimentos").update({ qtd: 0, comprado: false }).gt("qtd", 0);
  }

  const todos = itens ?? [];
  const naLista = todos.filter((i) => i.qtd > 0);
  const total = arred(naLista.reduce((s, i) => s + i.preco * i.qtd, 0));
  const noCarrinho = arred(naLista.filter((i) => i.comprado).reduce((s, i) => s + i.preco * i.qtd, 0));
  const falta = arred(total - noCarrinho);
  const porPessoa = pessoas > 1 ? arred(total / pessoas) : total;
  const orc = Number(orcamento) || 0;
  const restante = arred(orc - total);
  const pct = orc > 0 ? Math.min(100, (total / orc) * 100) : 0;
  const termo = busca.trim().toLowerCase();
  const visiveis = todos.filter((i) => (ver === "todos" || i.qtd > 0) && (!termo || i.nome.toLowerCase().includes(termo)));
  const grupos = Object.entries(
    visiveis.reduce<Record<string, Item[]>>((acc, i) => { (acc[i.categoria] ??= []).push(i); return acc; }, {}),
  );

  async function lancarComoConta() {
    if (total <= 0) return;
    const dividida = pessoas > 1;
    const texto = dividida ? `${brl(porPessoa)} (sua parte de ${brl(total)})` : brl(total);
    if (!window.confirm(`Lançar ${texto} em Contas como "Compras do mercado" e limpar a lista?`)) return;
    const { error } = await supabase.from("contas").insert({
      descricao: "Compras do mercado",
      valor: arred(dividida ? porPessoa : total),
      vencimento: hojeLocal(),
      categoria: "Mercado",
      pessoas,
      valor_total: dividida ? total : null,
      pago: true,
    });
    if (error) { setMsg("Não foi possível lançar em Contas. Tente novamente."); return; }
    await supabase.from("mantimentos").update({ qtd: 0, comprado: false }).gt("qtd", 0);
    setPessoas(1);
    setMsg("Lançado em Contas! ✅");
    onLancado();
    carregar();
  }

  async function compartilhar() {
    const linhas = naLista.map((i) => `${i.comprado ? "✅" : "▫️"} ${i.nome} — ${i.qtd}x ${brl(i.preco)} = ${brl(arred(i.preco * i.qtd))}`);
    const texto = [
      "🛒 Lista de compras — Casa em Dia", "", ...linhas, "", `Total: ${brl(total)}`,
      ...(pessoas > 1 ? [`Cada um (${pessoas} pessoas): ${brl(porPessoa)}`] : []),
    ].join("\n");
    try {
      if (navigator.share) { await navigator.share({ title: "Lista de compras", text: texto }); return; }
    } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  if (!itens) return <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">Carregando…</div>;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl bg-card p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Total da lista</p>
            <p className="break-all font-display text-2xl font-bold text-primary">{brl(total)}</p>
          </div>
          <p className="shrink-0 text-right text-xs text-muted-foreground">{naLista.length} {naLista.length === 1 ? "item" : "itens"}</p>
        </div>

        {naLista.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0 rounded-lg bg-background p-2">
              <p className="text-xs text-muted-foreground">No carrinho</p>
              <p className="break-all font-semibold text-primary">{brl(noCarrinho)}</p>
            </div>
            <div className="min-w-0 rounded-lg bg-background p-2">
              <p className="text-xs text-muted-foreground">Falta pegar</p>
              <p className="break-all font-semibold">{brl(falta)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-muted-foreground">
            Orçamento do mercado
            <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ex: 800" value={orcamento} onChange={(e) => mudarOrcamento(e.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground" />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">
            Dividir por
            <select value={pessoas} onChange={(e) => setPessoas(Number(e.target.value))} className="mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n === 1 ? "Não dividir" : `${n} pessoas`}</option>)}
            </select>
          </label>
        </div>

        {orc > 0 && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${total > orc ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className={`text-xs font-medium ${total > orc ? "text-destructive" : "text-muted-foreground"}`}>
              {total > orc ? `Passou ${brl(-restante)} do orçamento` : `Ainda cabem ${brl(restante)} no orçamento`}
            </p>
          </div>
        )}

        {pessoas > 1 && total > 0 && <p className="text-sm font-semibold text-primary">{brl(porPessoa)} por pessoa</p>}
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button onClick={compartilhar} disabled={naLista.length === 0} className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Compartilhar lista</button>
        <button onClick={lancarComoConta} disabled={naLista.length === 0} className="rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50">Lançar em Contas</button>
        <button onClick={limparLista} disabled={naLista.length === 0} className="rounded-lg border border-input bg-card py-3 text-sm font-medium disabled:opacity-50">Limpar lista</button>
      </div>

      {msg && <p className={`rounded-lg bg-card p-2 text-center text-sm ${msg.startsWith("Não") ? "text-destructive" : "text-primary"}`}>{msg}</p>}

      <form onSubmit={adicionar} className="grid grid-cols-1 gap-2 rounded-xl bg-card p-3 shadow-sm sm:grid-cols-4 sm:p-4">
        <p className="text-sm font-semibold sm:col-span-4">Cadastrar produto</p>
        <input required placeholder="Produto (ex: Arroz 5kg)" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-base sm:col-span-2" />
        <input required type="number" inputMode="decimal" step="0.01" min="0" placeholder="Preço (R$)" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-base" />
        <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-base">
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="rounded-lg bg-accent py-3 font-semibold text-accent-foreground sm:col-span-4">Salvar produto</button>
      </form>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input type="search" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-0 rounded-lg border border-input bg-card px-3 py-2.5 text-base" />
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
          <button onClick={() => setVer("lista")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${ver === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Na lista</button>
          <button onClick={() => setVer("todos")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${ver === "todos" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Todos</button>
        </div>
      </div>

      {visiveis.length === 0 && (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          {todos.length === 0
            ? "Cadastre seus produtos e preços acima pra montar a lista."
            : ver === "lista" && !termo
              ? "Nada na lista ainda. Toque em “Todos” e use o + nos produtos."
              : "Nenhum produto encontrado."}
        </p>
      )}

      {grupos.map(([cat, lista]) => (
        <section key={cat} className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{cat}</p>
          <ul className="space-y-2">
            {lista.map((i) => (
              <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-card p-3 shadow-sm">
                <input type="checkbox" checked={i.comprado} disabled={i.qtd === 0} onChange={() => alternarComprado(i)} className="h-5 w-5 shrink-0 accent-primary disabled:opacity-30" aria-label="Marcar como pego" />
                <div className="min-w-0">
                  <p className={`break-words ${i.comprado ? "text-muted-foreground line-through" : "font-medium"}`}>{i.nome}</p>
                  {editando === i.id ? (
                    <input
                      autoFocus type="number" inputMode="decimal" step="0.01" min="0" value={precoEdit}
                      onChange={(e) => setPrecoEdit(e.target.value)}
                      onBlur={() => salvarPreco(i)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      className="mt-1 w-28 rounded-md border border-input bg-background px-2 py-1 text-base"
                    />
                  ) : (
                    <button onClick={() => { setEditando(i.id); setPrecoEdit(String(i.preco)); }} className="text-xs text-primary">{brl(i.preco)} · mudar preço</button>
                  )}
                  {i.qtd > 0 && <p className="text-xs text-muted-foreground">{i.qtd}x = {brl(arred(i.preco * i.qtd))}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => mudarQtd(i, -1)} disabled={i.qtd === 0} className="grid h-9 w-9 place-items-center rounded-lg border border-input text-lg disabled:opacity-30" aria-label="Diminuir">−</button>
                  <span className="w-6 text-center font-semibold">{i.qtd}</span>
                  <button onClick={() => mudarQtd(i, 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-lg text-primary-foreground" aria-label="Aumentar">+</button>
                  <button onClick={() => remover(i)} className="ml-1 grid h-8 w-8 place-items-center rounded-md text-sm text-muted-foreground hover:text-destructive" aria-label="Excluir produto">✕</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
