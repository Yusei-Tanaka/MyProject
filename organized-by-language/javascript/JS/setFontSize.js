// setFontSize.js

// 最大フォントサイズの調整
function setMaxFontSize() {
    const myTitle = document.getElementById("myTitle");
    const maxHeight = myTitle.offsetHeight; // ボックスの高さを取得
    const text = myTitle.value || myTitle.placeholder; // 入力されたテキストまたはプレースホルダー
    const context = document.createElement("canvas").getContext("2d"); // 仮想キャンバス
    let fontSize = 1; // 最小フォントサイズから開始
    context.font = `${fontSize}px sans-serif`;
  
    // テキストがボックスの高さに収まる最大フォントサイズを計算
    while (context.measureText(text).width < myTitle.offsetWidth && fontSize < maxHeight) {
      fontSize += 1; // フォントサイズを1pxずつ増加
      context.font = `${fontSize}px sans-serif`;
    }
  
    // フォントサイズがボックスを超えた場合、1px減らして確定
    myTitle.style.fontSize = `${fontSize - 1}px`;
  }
  
  // イベントリスナーでリアルタイム調整
  const myTitle = document.getElementById("myTitle");
  myTitle.addEventListener("input", setMaxFontSize); // 入力時に調整
  window.addEventListener("resize", setMaxFontSize); // ウィンドウサイズ変更時に調整
  
  // 初期化
  setMaxFontSize();
  