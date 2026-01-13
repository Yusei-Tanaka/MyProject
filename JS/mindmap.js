window.addEventListener('DOMContentLoaded', function() {
  const $ = go.GraphObject.make;

  const diagram = $(go.Diagram, "myDiagramDiv", {
    "undoManager.isEnabled": true,
    allowInsert: false
  });

  /* ツリーレイアウト */
  diagram.layout = $(go.TreeLayout, {
    angle: 90,
    layerSpacing: 50,
    nodeSpacing: 20
  });

  // レイアウト完了後に全ノードを一括で上方に平行移動
  diagram.addDiagramListener("LayoutCompleted", function(e) {
    // ずらす量（Y方向）
    var offsetY = -200;
    diagram.nodes.each(function(node) {
      var loc = node.location;
      node.location = new go.Point(loc.x, loc.y + offsetY);
    });
  });

  /* ノードテンプレート */
  diagram.nodeTemplate =
    $(go.Node, "Auto",
      new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
      $(go.Shape, "Rectangle",
        // key:0（タイトルノード）のみ色を変更
        new go.Binding("fill", "key", function(key) {
          return key === 0 ? "#ffcc00" : "lightblue";
        })
      ),
      $(go.TextBlock,
        // key:0（タイトルノード）は折り返しなし、それ以外は折り返し有効
        new go.Binding("text").makeTwoWay(),
        new go.Binding("wrap", "key", function(key) {
          return key === 0 ? go.TextBlock.None : go.TextBlock.WrapFit;
        }),
        new go.Binding("width", "key", function(key) {
          return key === 0 ? NaN : 120;
        }),
        { margin: 8 }
      ),
      {
        doubleClick: (e, node) => {
          const oldText = node.data.text;
          const newText = prompt("ノードのテキストを変更:", oldText);
          if (newText !== null && newText.trim() !== "" && newText !== oldText) {
            diagram.startTransaction("edit text");
            diagram.model.set(node.data, "text", newText);
            diagram.commitTransaction("edit text");
          }
        }
      },
      {
        contextMenu:
          $("ContextMenu",
            $("ContextMenuButton",
              $(go.TextBlock, "子ノードを追加"),
              { click: (e, obj) => addChild(obj.part.adornedPart) }
            ),
            $("ContextMenuButton",
              $(go.TextBlock, "ノードを削除"),
              { click: (e, obj) => removeNode(obj.part.adornedPart) }
            )
          )
      }
    );

  /* リンクライン */
  diagram.linkTemplate = $(go.Link, $(go.Shape));

  /* 子ノードの追加 */
  function addChild(node) {
    diagram.startTransaction("add child");
    const newNodeData = { text: "新しいノード", parent: node.data.key };
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add child");
  }

  /* ノードの削除 */
  function removeNode(node) {
    if (!node) return;
    diagram.startTransaction("remove");
    diagram.remove(node);
    diagram.commitTransaction("remove");
  }

  /* 初期データをmyTitleから取得 */
  // localStorageからsearchTitleを取得
  var searchTitle = localStorage.getItem('searchTitle');
  var titleInput = document.getElementById('myTitle');
  var initialText = searchTitle || (titleInput && titleInput.value) || "新しいマインドマップ";
  diagram.model = new go.TreeModel([
    { key: 0, text: initialText, loc: "0 -200" }
  ]);

  // myTitleの値が変更されたらルートノードも更新
  if (titleInput) {
    titleInput.addEventListener('input', function() {
      diagram.model.set(diagram.model.nodeDataArray[0], "text", titleInput.value || "新しいマインドマップ");
    });
  }
});