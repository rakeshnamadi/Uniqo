/* Home-page teaser: the avatar cycles through a few looks to invite people into the Design Lobby */
(() => {
  const box = document.getElementById("ltAvatar"), cap = document.getElementById("ltCaption");
  if (!box || typeof UQLook === "undefined") return;
  const LOOKS = [
    [{ sil: "anarkali", fab: "georgette", col: "#b0245a", acc: "#c9a05a", neck: "sweetheart", slv: "elbow", len: "floor", emb: ["gota"] }, "Georgette Anarkali · Gota border"],
    [{ sil: "saree", fab: "silk", col: "#5a1730", acc: "#c9a05a", neck: "round", slv: "cap", len: "floor", emb: ["zari"] }, "Silk Saree · Zari lines"],
    [{ sil: "kurta", fab: "chikankari", col: "#8fa383", acc: "#f3ead8", neck: "mandarin", slv: "three", len: "midi", emb: ["pearls"], dup: "shoulder" }, "Chikankari Kurta Set · Pearl buttons"],
    [{ sil: "sheath", fab: "satin_silk", col: "#17130f", acc: "#c9a05a", neck: "boat", slv: "none", len: "midi", emb: [], belt: true }, "Satin Silk Sheath · Gold belt"],
    [{ sil: "lehenga", fab: "chanderi", col: "#d08a2a", acc: "#c9a05a", neck: "square", slv: "elbow", len: "floor", emb: ["mirror"], dup: "draped" }, "Chanderi Lehenga · Mirror work"],
    [{ sil: "aline", fab: "denim", col: "#2b3a67", acc: "#c3c4cc", neck: "v", slv: "full", len: "knee", emb: ["block"], pockets: true }, "Denim A-line · Block print · Pockets"],
  ];
  let i = 0;
  const show = () => {
    const [look, label] = LOOKS[i++ % LOOKS.length];
    box.classList.remove("spin"); void box.offsetWidth; box.classList.add("spin");
    setTimeout(() => { box.innerHTML = UQLook.svg(look, { id: "teaser" }); cap.textContent = label; }, 330);
  };
  box.innerHTML = UQLook.svg(LOOKS[0][0], { id: "teaser" }); i = 1;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(show, 3200);
})();
