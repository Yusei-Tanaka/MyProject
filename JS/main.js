// main.js

// 1. レイアウト設定
var config = {
  // グローバル設定: 閉じる/最大化/ポップアウトアイコンをすべて表示
  settings: {
      showCloseIcon: true,
      showMaximiseIcon: true, 
      showPopoutIcon: true
  },
  
  // レイアウト構造: 左右2列
  content: [{
      type: 'row',
      content: [
          {
              type: 'column',
              width: 0, // 初期: 左カラム 0%
              content: [
                  {
                      type: 'component',
                      componentName: 'leftNavi',
                      closable: true,
                      header: { show: false }
                  },
                  {
                      type: 'component',
                      componentName: 'rightNavi',
                      closable: true,
                      header: { show: false }
                  }
              ]
          },
          {
              type: 'column',
              width: 100, // 初期: 右カラム 100%
              content: [
                  {
                      type: 'component',
                      componentName: 'mainContents',
                      closable: true,
                      header: { show: false }
                  },
                  {
                      type: 'component',
                      componentName: 'extraContent',
                      closable: true,
                      header: { show: false }
                  }
              ]
          }
      ]
  }]
};

// 2. レイアウトのインスタンス化 (Golden Layout コンテナを指定)
// jQueryを使って #golden-layout-container を指定します
var myLayout = new GoldenLayout( config, $('#golden-layout-container') );

// 3. コンポーネントの登録
// index.htmlの非表示エリアからコンテンツを取り出し、GLコンテナに移動します。
myLayout.registerComponent( 'leftNavi', function( container, componentState ){
// #left-navi-content の中身をコンテナに移動
var content = $('#left-navi-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'mainContents', function( container, componentState ){
// #main-contents-content の中身をコンテナに移動
var content = $('#main-contents-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'rightNavi', function( container, componentState ){
// #right-navi-content の中身をコンテナに移動
var content = $('#right-navi-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'extraContent', function( container, componentState ){
// #extra-content-content の中身をコンテナに移動
var content = $('#extra-content-content').children();
container.getElement().append( content );
});

// 4. レイアウトの初期化と起動
myLayout.init();

// 5. ボタン押下で左20%・右80%に変更
$(function(){
    var row = null;
    myLayout.on('initialised', function(){
        // 初期化後に row を取得し、サイズ再計算
        row = myLayout.root.contentItems[0];
        if (row) {
            row.callDownwards('setSize');
        }
    });

    // 左 20%・右 80% に切替するボタン
    $('#showLeftBtn').on('click', function(){
        if (!row) {
            row = myLayout.root.contentItems[0];
        }
        if (!row || row.contentItems.length < 2) return;
        var leftCol = row.contentItems[0];
        var rightCol = row.contentItems[1];
        leftCol.config.width = 20;
        rightCol.config.width = 80;
        // サイズ再計算を下位要素に伝播
        row.callDownwards('setSize');
        $('#createHypothesisBtn').removeAttr('hidden').removeClass('is-hidden');
    });
});