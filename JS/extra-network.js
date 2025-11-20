document.addEventListener("DOMContentLoaded", () => {
  // extraNetworkエリアの初期化
  const container = document.getElementById("extraNetwork");
  const nodes = new vis.DataSet([]);
  const edges = new vis.DataSet([]);
  const data = { nodes, edges };
  const options = {
    physics: {
      enabled: true, // ノードの物理エンジンを有効化
    },
    nodes: {
      shape: "dot",
      size: 16,
      font: {
        size: 14,
        color: "#000",
      },
    },
    edges: {
      arrows: {
        to: { enabled: true },
      },
      color: "#848484",
      smooth: true,
    },
  };
  const network = new vis.Network(container, data, options);

  // ノードデータセットをエリアに関連付け
  container.visNetworkNodes = nodes;

  // 空のノードとエッジを初期化
  var nodesExtra = new vis.DataSet(); // 初期状態ではノードは空
  var edgesExtra = new vis.DataSet(); // 初期状態ではエッジも空

  // ネットワークのオプション
  var extraOptions = {
    manipulation: {
      enabled: false, // デフォルトで編集機能は無効
    },
    physics: {
      enabled: false, // ノードの物理エンジンを無効にして動かないようにする
    },
    edges: {
      smooth: false, // エッジを直線にする
      arrows: "to", // 矢印を追加
    },
  };

  // ネットワークの作成
  var extraContainer = document.getElementById("extraNetwork");
  var extraData = {
    nodes: nodesExtra,
    edges: edgesExtra,
  };
  var extraNetwork = new vis.Network(extraContainer, extraData, extraOptions);

  // 最後に選択されたノードを保存
  var selectedNodesExtra = []; // 選択されたノードIDを保存

  // ノードをハイライトする関数
  function highlightNodesExtra(nodeIds) {
    // すべてのノードをデフォルトスタイルに戻す
    nodesExtra.forEach(function (node) {
      // テーマノード（ゴールド）は色を変更しない
      if (node.color && node.color.background === "#FFD700") {
        return; // テーマノードはスキップ
      }
      nodesExtra.update({ id: node.id, color: { background: "#97C2FC" } }); // デフォルトの色
    });

    // 選択されたノードをハイライト
    nodeIds.forEach(function (id) {
      const node = nodesExtra.get(id);
      // テーマノード（ゴールド）は色を変更しない
      if (node.color && node.color.background === "#FFD700") {
        return; // テーマノードはスキップ
      }
      nodesExtra.update({ id: id, color: { background: "#FF5733" } }); // ハイライト色
    });
  }

  // ノードの選択イベント
  extraNetwork.on("selectNode", function (event) {
    if (event.nodes.length > 0) {
      // Shiftキーが押されている場合は選択を追加
      if (event.event.srcEvent.shiftKey) {
        selectedNodesExtra = [...new Set([...selectedNodesExtra, ...event.nodes])]; // 重複を防ぐ
      } else {
        // Shiftキーが押されていない場合は選択をリセット
        selectedNodesExtra = event.nodes;
      }
    }

    // ノードの情報を表示
    updateCopiedContentExtra(selectedNodesExtra);

    // 選択されたノードをハイライト
    highlightNodesExtra(selectedNodesExtra);

    console.log("Selected Nodes:", selectedNodesExtra);
  });

  // ノードの選択解除イベント
  extraNetwork.on("deselectNode", function (event) {
    if (event.previousSelection.nodes.length > 0) {
      // 選択解除されたノードをリストから削除
      selectedNodesExtra = selectedNodesExtra.filter(function (id) {
        return !event.previousSelection.nodes.includes(id);
      });
    }

    // 表示内容を更新
    updateCopiedContentExtra(selectedNodesExtra);

    // 選択されたノードをハイライト
    highlightNodesExtra(selectedNodesExtra);
  });

  // ネットワークのクリックイベント
  extraNetwork.on("click", function (event) {
    if (event.nodes.length === 0 && event.edges.length === 0) {
      // ノードやエッジが選択されていない場合
      selectedNodesExtra = []; // 選択リセット
      highlightNodesExtra([]); // ハイライトを解除
    }
  });

  // ノードまたはエッジをダブルクリックで編集
  extraNetwork.on("doubleClick", function (event) {
    if (event.nodes.length > 0) {
      // ノードの編集
      var nodeId = event.nodes[0];
      var nodeData = nodesExtra.get(nodeId);
      var newLabel = prompt("ノードのラベルを変更", nodeData.label);
      if (newLabel !== null) {
        nodeData.label = newLabel;
        nodesExtra.update(nodeData); // ノードデータを更新
      }
    } else if (event.edges.length > 0) {
      // エッジの編集
      var edgeId = event.edges[0];
      var edgeData = edgesExtra.get(edgeId);
      var newLabel = prompt("エッジのラベルを変更", edgeData.label);
      if (newLabel !== null) {
        edgeData.label = newLabel;
        edgesExtra.update(edgeData); // エッジデータを更新
      }
    }
  });

  // ノード追加ボタン
  document.getElementById("addNodeExtraBtn").addEventListener("click", function () {
    var newNode = {
      id: nodesExtra.length + 1, // IDを自動生成
      label: "New Node",
    };
    nodesExtra.add(newNode); // 新しいノードを追加
  });

  // ノード削除ボタン
  document.getElementById("deleteNodeExtraBtn").addEventListener("click", function () {
    if (selectedNodesExtra.length === 1) {
      var nodeId = selectedNodesExtra[0];
      nodesExtra.remove({ id: nodeId }); // 選択されたノードを削除
      selectedNodesExtra = []; // 選択リセット
    } else {
      alert("削除するノードを選択してください。");
    }
  });

  // エッジ追加ボタン
  document.getElementById("addEdgeExtraBtn").addEventListener("click", function () {
    if (selectedNodesExtra.length === 2) {
      var arrowEnabled = document.getElementById("arrowToggle").checked; // チェックボックスの状態を取得

      // 選択された2つのノード間にエッジを追加
      var newEdge = {
        from: selectedNodesExtra[0],
        to: selectedNodesExtra[1],
        label: "New Edge",
        arrows: arrowEnabled ? "to" : "", // 矢印の有無をチェックボックスで決定
      };

      try {
        edgesExtra.add(newEdge); // エッジを追加
      } catch (error) {
        console.error("エッジの追加に失敗しました:", error);
      }
    } else {
      alert("2つのノードを選択してください。");
    }
  });

  // エッジ削除ボタン
  document.getElementById("deleteEdgeExtraBtn").addEventListener("click", function () {
    if (selectedNodesExtra.length === 2) {
      var fromNode = selectedNodesExtra[0];
      var toNode = selectedNodesExtra[1];

      // 選択された2つのノード間のエッジを取得
      var edgesToDelete = edgesExtra.get({
        filter: function (edge) {
          return (
            (edge.from === fromNode && edge.to === toNode) ||
            (edge.from === toNode && edge.to === fromNode)
          );
        },
      });

      // エッジを削除
      if (edgesToDelete.length > 0) {
        edgesToDelete.forEach(function (edge) {
          edgesExtra.remove(edge.id);
        });
      } else {
        alert("選択されたノード間にエッジが存在しません。");
      }
    } else {
      alert("2つのノードを選択してください。");
    }
  });

  // ノードタイトルを表示する関数（複数ノード対応）
  function updateCopiedContentExtra(nodeIds) {
    var selectedContent = nodeIds
      .map(function (id) {
        var node = nodesExtra.get(id);
        return node ? node.label : "";
      })
      .join(", "); // 複数ノードのラベルをカンマ区切りで表示

    // タイトル表示エリアに設定
    var copiedContentElement = document.getElementById("copiedContent");
    copiedContentElement.innerText = selectedContent;
  }

  // 探索スタートボタンのクリックイベント
  document.getElementById("serchBtn").addEventListener("click", () => {
    const themeInput = document.getElementById("myTitle").value.trim();

    if (themeInput) {
      // ノードを追加（テーマノードは特定の色で表示）
      nodesExtra.add({
        id: themeInput, // ノードIDとしてテーマを使用
        label: themeInput,
        color: { background: "#FFD700" }, // テーマノードの色（ゴールド）
      });

    } else {
      alert("探索テーマを入力してください。");
    }
  });
});