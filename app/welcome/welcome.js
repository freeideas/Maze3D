// Fills in the best times and who is playing, from the server's /api/summary.
const $ = (id) => document.getElementById(id);

async function refresh() {
  try {
    const summary = await (await fetch("../api/summary", { cache: "no-store" })).json();
    const rows = $("best").querySelector("tbody");
    rows.replaceChildren(...summary.best.map(({ level, ms, name }) => {
      const tr = document.createElement("tr");
      for (const text of [level, (ms / 1000).toFixed(1) + " s", name]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      return tr;
    }));
    $("best").hidden = !summary.best.length;
    $("none").hidden = !!summary.best.length;
    const now = Object.values(summary.playing).reduce((a, b) => a + b, 0);
    $("playing").textContent = now === 0 ? "No one is playing right now." : now === 1 ? "1 person is playing right now." : `${now} people are playing right now.`;
  } catch {
    $("playing").textContent = "";
  }
}
refresh();
setInterval(refresh, 15000);
