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
              width: 20, // 左カラムの幅（全体の20%）
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
              width: 80, // 右カラムの幅（全体の80%）
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