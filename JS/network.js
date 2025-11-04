// 空のノードとエッジを初期化
var nodes = new vis.DataSet(); // 初期状態ではノードは空
var edges = new vis.DataSet(); // 初期状態ではエッジも空

// ネットワークのオプション
var options = {
  manipulation: {
    enabled: false, // デフォルトで編集機能は無効
  },
  physics: {
    enabled: false, // ノードの物理エンジンを無効にして動かないようにする
  },
  edges: {
    smooth: false, // エッジを直線にする
    arrows: "to", //矢印を追加
  },
};

// ネットワークの作成
var container = document.getElementById("mynetwork");
var data = {
  nodes: nodes,
  edges: edges,
};
var network = new vis.Network(container, data, options);

// 最後に選択された2つのノードを保存
var selectedNodes = []; // 選択されたノードIDを保存

// ノードの選択イベント
network.on("selectNode", function (event) {
  var nodeId = event.nodes[0]; // 選択されたノードのID

  // 2つのノードを選択するロジック
  if (selectedNodes.length < 2) {
    selectedNodes.push(nodeId); // ノードIDを選択リストに追加
  } else {
    // 3つ目以降を選択した場合、最初に戻して新たに選び直す
    selectedNodes = [nodeId]; // 最後のノードで上書き
  }

  // ノードの情報を表示
  updateCopiedContent(nodeId);

  // 2つ目のノードが選ばれた場合、アラートを表示
  if (selectedNodes.length === 2) {
    alert("2つのノードが選択されました。エッジを作成できます。");
  }
});

// ノードの選択解除イベント
network.on("deselectNode", function (event) {
  var nodeId = event.previousSelection.nodes[0]; // 解除されたノードのID
  selectedNodes = selectedNodes.filter(function (id) {
    return id !== nodeId; // 選択リストから解除されたノードを削除
  });

  // 表示内容をリセット
  document.getElementById("copiedContent").innerText = '';
});

// ノードまたはエッジをダブルクリックで編集
network.on("doubleClick", function (event) {
  if (event.nodes.length > 0) {
    // ノードの編集
    var nodeId = event.nodes[0];
    var nodeData = nodes.get(nodeId);
    var newLabel = prompt("ノードのラベルを変更", nodeData.label);
    if (newLabel !== null) {
      nodeData.label = newLabel;
      nodes.update(nodeData); // ノードデータを更新
    }
  } else if (event.edges.length > 0) {
    // エッジの編集
    var edgeId = event.edges[0];
    var edgeData = edges.get(edgeId);
    var newLabel = prompt("エッジのラベルを変更", edgeData.label);
    if (newLabel !== null) {
      edgeData.label = newLabel;
      edges.update(edgeData); // エッジデータを更新
    }
  }
});

// ノード追加ボタン
document.getElementById("addNodeBtn").addEventListener("click", function () {
  var newNode = {
    id: nodes.length + 1, // IDを自動生成
    label: "New Node",
  };
  nodes.add(newNode); // 新しいノードを追加
});

// ノード削除ボタン
document.getElementById("deleteNodeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 1) {
    var nodeId = selectedNodes[0];
    nodes.remove({ id: nodeId }); // 選択されたノードを削除
    selectedNodes = []; // 選択リセット
  } else {
    alert("削除するノードを選択してください。");
  }
});

// エッジ追加ボタン
document.getElementById("addEdgeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 2) {
    var arrowEnabled = document.getElementById("arrowToggle").checked; // チェックボックスの状態を取得

    var newEdge = {
      from: selectedNodes[0],
      to: selectedNodes[1],
      label: "New Edge",
      arrows: arrowEnabled ? "to" : "", // 矢印の有無をチェックボックスで決定
    };
    edges.add(newEdge); // エッジを追加
    selectedNodes = []; // 選択リセット
  } else {
    alert("2つのノードを選択してください。");
  }
});


// エッジ削除ボタン
document.getElementById("deleteEdgeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 2) {
    var fromNode = selectedNodes[0];
    var toNode = selectedNodes[1];

    // 選択された2つのノード間のエッジを取得
    var edgeToDelete = edges.get({
      filter: function (edge) {
        return (edge.from === fromNode && edge.to === toNode) || (edge.from === toNode && edge.to === fromNode);
      },
    });

    if (edgeToDelete.length > 0) {
      edges.remove(edgeToDelete[0]); // エッジを削除
      selectedNodes = []; // 選択リセット
      alert("エッジを削除しました。");
    } else {
      alert("選択したノード間にエッジは存在しません。");
    }
  } else {
    alert("エッジを削除するために2つのノードを選択してください。");
  }
});

// ノードタイトルを表示する関数
function updateCopiedContent(nodeId) {
  var node = nodes.get(nodeId); // ノード情報を取得
  var selectedContent = node.label; // ノードのラベル

  // タイトル表示エリアに設定
  var copiedContentElement = document.getElementById("copiedContent");
  copiedContentElement.innerText = selectedContent;
}
