window.addEventListener('DOMContentLoaded', function() {
  const $ = go.GraphObject.make;

  const diagram = $(go.Diagram, "myDiagramDiv", {
    "undoManager.isEnabled": true,
    allowInsert: false
  });

  function logMindmapAction(message) {
    if (typeof window.addSystemLog === "function") {
      window.addSystemLog(message);
    }
  }

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
      $(go.Shape, "RoundedRectangle",
        {
          stroke: "#3498DB",
          strokeWidth: 2,
          fill: "#FFFFFF"
        },
        new go.Binding("fill", "key", function(key) {
          return key === 0 ? "#E67E22" : "#FFFFFF";
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#E67E22" : "#3498DB";
        })
      ),
      $(go.TextBlock,
        {
          margin: 8,
          stroke: "#34495E",
          font: "bold 14px 'Segoe UI', sans-serif"
        },
        new go.Binding("text").makeTwoWay(),
        new go.Binding("wrap", "key", function(key) {
          return key === 0 ? go.TextBlock.None : go.TextBlock.WrapFit;
        }),
        new go.Binding("width", "key", function(key) {
          return key === 0 ? NaN : 120;
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#FFFFFF" : "#34495E";
        })
      ),
      {
        doubleClick: (e, node) => {
          const oldText = node.data.text;
          const newText = prompt("ノードのテキストを変更:", oldText);
          if (newText !== null && newText.trim() !== "" && newText !== oldText) {
            diagram.startTransaction("edit text");
            diagram.model.set(node.data, "text", newText);
            diagram.commitTransaction("edit text");
            logMindmapAction(`マインドマップ: ノード編集 key=${node.data.key} "${oldText}" → "${newText}"`);
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
  diagram.linkTemplate = $(go.Link, $(go.Shape, { stroke: "#95A5A6", strokeWidth: 2 }));

  /* 子ノードの追加 */
  function addChild(node) {
    diagram.startTransaction("add child");
    const newNodeData = { text: "新しいノード", parent: node.data.key };
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add child");
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${node.data.key} "${node.data.text}"`);
  }

  /* ノードの削除 */
  function removeNode(node) {
    if (!node) return;
    if (node.data && node.data.key === 0) {
      alert("タイトルノードは削除できません。");
      return;
    }
    const removedKey = node.data && node.data.key !== undefined ? node.data.key : "";
    const removedText = node.data && node.data.text ? node.data.text : "";
    diagram.startTransaction("remove subtree");
    var subtree = node.findTreeParts();
    diagram.removeParts(subtree, false);
    diagram.commitTransaction("remove subtree");
    logMindmapAction(`マインドマップ: ノード削除 key=${removedKey} "${removedText}"`);
  }

  /* 初期データをmyTitleから取得 */
  // localStorageからsearchTitleを取得
  var searchTitle = localStorage.getItem('searchTitle');
  var titleInput = document.getElementById('myTitle');
  var initialText = searchTitle || (titleInput && titleInput.value) || "新しいマインドマップ";
  var lastTitleText = initialText;
  diagram.model = new go.TreeModel([
    { key: 0, text: initialText, loc: "0 -200" }
  ]);

  // myTitleの値が変更されたらルートノードも更新
  if (titleInput) {
    titleInput.addEventListener('input', function() {
      diagram.model.set(diagram.model.nodeDataArray[0], "text", titleInput.value || "新しいマインドマップ");
    });
    titleInput.addEventListener('change', function() {
      const newTitle = titleInput.value || "新しいマインドマップ";
      if (newTitle !== lastTitleText) {
        logMindmapAction(`マインドマップ: タイトル変更 "${lastTitleText}" → "${newTitle}"`);
        lastTitleText = newTitle;
      }
    });
  }

  // 外部スクリプトから参照できるようヘルパーを公開
  window.getMindmapNodes = function () {
    if (!diagram.model) return [];
    return diagram.model.nodeDataArray.map(function (data) {
      return { key: data.key, text: data.text, parent: data.parent };
    });
  };

  window.addMindmapChild = function (parentKey, text) {
    if (!diagram.model) return false;
    if (!text || !text.trim()) return false;

    var normalizedKey = parentKey;
    var parentNode = diagram.findNodeForKey(normalizedKey);
    if (!parentNode && typeof parentKey === "string" && parentKey !== "") {
      var numericKey = Number(parentKey);
      if (!isNaN(numericKey)) {
        normalizedKey = numericKey;
        parentNode = diagram.findNodeForKey(normalizedKey);
      }
    }

    if (!parentNode) return false;

    diagram.startTransaction("add mindmap child");
    var newNodeData = { text: text.trim(), parent: parentNode.data.key };
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add mindmap child");
    diagram.select(diagram.findNodeForData(newNodeData));
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${parentNode.data.key} "${parentNode.data.text}" text="${text.trim()}"`);
    return true;
  };
});