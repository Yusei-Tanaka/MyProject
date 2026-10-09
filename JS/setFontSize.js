// Keep the inquiry title readable without expanding into neighboring controls.
function setMaxFontSize() {
  const input = document.getElementById("myTitle");
  if (!input) return;
  const text = input.value || input.placeholder || "";
  const context = document.createElement("canvas").getContext("2d");
  let size = 16;
  const available = Math.max(0, input.clientWidth - 24);
  while (size > 12) {
    context.font = `${size}px sans-serif`;
    if (context.measureText(text).width <= available) break;
    size--;
  }
  input.style.fontSize = `${size}px`;
  input.title = text;
}
const titleInput = document.getElementById("myTitle");
if (titleInput) {
  titleInput.addEventListener("input", setMaxFontSize);
  window.addEventListener("resize", setMaxFontSize);
  document.addEventListener("DOMContentLoaded", setMaxFontSize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(setMaxFontSize).observe(titleInput);
  setMaxFontSize();
}
