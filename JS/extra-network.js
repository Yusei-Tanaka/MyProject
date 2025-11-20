document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("extraNetwork");
  const nodes = new vis.DataSet([]);
  const edges = new vis.DataSet([]);
  const data = { nodes, edges };
  const options = { physics: true };
  const network = new vis.Network(container, data, options);

  // ノード追加
  document.getElementById("addNodeExtraBtn").addEventListener("click", () => {
    const nodeId = nodes.length + 1;
    nodes.add({ id: nodeId, label: `Node ${nodeId}` });
  });

  // ノード削除
  document.getElementById("deleteNodeExtraBtn").addEventListener("click", () => {
    const selectedNodes = network.getSelectedNodes();
    nodes.remove(selectedNodes);
  });

  // エッジ追加
  document.getElementById("addEdgeExtraBtn").addEventListener("click", () => {
    const selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length === 2) {
      edges.add({ from: selectedNodes[0], to: selectedNodes[1] });
    } else {
      alert("2つのノードを選択してください");
    }
  });

  // エッジ削除
  document.getElementById("deleteEdgeExtraBtn").addEventListener("click", () => {
    const selectedEdges = network.getSelectedEdges();
    edges.remove(selectedEdges);
  });
});