(() => {
  const LANGUAGE_STORAGE_KEY = "appLanguage";
  const SUPPORTED_LANGUAGES = ["ja", "en"];
  const DEFAULT_LANGUAGE = "ja";

  const MESSAGES = {
    ja: {
      title: {
        index: "探索活動支援システム",
        themeSelect: "探索テーマ選択 - 探索活動支援システム",
        main: "探究活動支援システム",
        userAdmin: "ユーザ管理画面"
      },
      common: {
        guest: "ゲスト",
        unset: "未設定",
        language: "表示言語",
        japanese: "日本語",
        english: "English",
        passwordPlaceholder: "パスワード"
      },
      admin: {
        menuAria: "管理画面選択",
        choose: "管理画面を選択",
        userAdmin: "ユーザ管理画面"
      },
      login: {
        heading: "ログインしてください",
        usernamePlaceholder: "ID",
        passwordPlaceholder: "パスワード",
        button: "ログイン"
      },
      theme: {
        switcherAria: "表示テーマ切替",
        label: "テーマ",
        sky: "スカイ",
        forest: "フォレスト",
        sunset: "サンセット",
        slate: "スレート",
        optionTitle: "{theme}テーマ",
        optionAria: "{theme}テーマに変更"
      },
      themeSelect: {
        heading: "取り組むテーマを入力または選択してください",
        historyLabel: "これまでのテーマ一覧",
        historyAria: "これまでのテーマ一覧",
        deleteSelected: "選択テーマ削除",
        clearHistory: "履歴全削除",
        newThemeLabel: "新規テーマ",
        newThemePlaceholder: "新しい探索テーマを入力",
        startButton: "探索スタート!"
      },
      main: {
        titlePlaceholder: "探索テーマを入力",
        showSideView: "サイドビューを表示",
        hideSideView: "サイドビューを閉じる",
        log: "ログ",
        keywordArea: "キーワード生成エリア",
        generate: "生成",
        generatedKeywords: "生成されたキーワード",
        mapArea: "キーワードマップ構成エリア",
        recenterTitle: "マップを中央に表示",
        addKeyword: "キーワードの追加",
        deleteKeyword: "キーワードの削除",
        addLink: "リンクの追加",
        deleteLink: "リンクの削除",
        createHypothesis: "仮説を追加",
        enableArrows: "矢印を有効化",
        hypothesisArea: "仮説発散エリア",
        hypothesisMap: "仮説関係性マップ"
      },
      userAdmin: {
        authHeading: "ユーザ管理画面",
        authDescription: "アクセスするにはパスワードを入力してください。",
        openAdmin: "管理画面に入る",
        backToLogin: "ログイン画面へ戻る",
        openPhpMyAdmin: "phpMyAdminを開く",
        protectedHeading: "ユーザ管理",
        newUserIdPlaceholder: "ユーザID（英数字/3〜32文字）",
        newUserPasswordPlaceholder: "パスワード",
        createUser: "ユーザ登録",
        selectTargetUser: "変更対象ユーザIDを選択",
        currentPasswordPlaceholder: "現在のパスワード",
        updatedPasswordPlaceholder: "新しいパスワード",
        updatePassword: "パスワード変更",
        refreshUsers: "ユーザ一覧を更新",
        userListHeading: "登録済みユーザ一覧",
        userListHint: "※ユーザIDを右クリックするとアカウントを削除できます。",
        noUsers: "ユーザが登録されていません。",
        rightClickDelete: "右クリックで削除",
        deletingUser: "ユーザ「{userId}」を削除中...",
        deleteUserFailed: "ユーザ削除に失敗しました。",
        userDeleted: "ユーザ「{userId}」を削除しました。",
        confirmDeleteUser: "ユーザ「{userId}」を削除します。\nよろしいですか？",
        fetchingUsers: "ユーザ一覧を取得中...",
        fetchUsersFailed: "ユーザ一覧の取得に失敗しました。",
        usersUpdated: "ユーザ一覧を更新しました（{count}件）。",
        enterUserAndPassword: "ユーザIDとパスワードを入力してください。",
        creatingUser: "ユーザを登録中...",
        createUserFailed: "ユーザ登録に失敗しました。",
        userCreated: "ユーザ「{userId}」を登録しました。",
        enterPasswordUpdateFields: "変更対象ユーザID・現在のパスワード・新しいパスワードを入力してください。",
        updatingPassword: "パスワードを変更中...",
        updatePasswordFailed: "パスワード変更に失敗しました。",
        passwordUpdated: "ユーザ「{userId}」のパスワードを変更しました。",
        authTimeout: "認証サーバへの接続がタイムアウトしました。もう一度お試しください。",
        authServerUnavailable: "認証サーバへ接続できません。サーバ起動状態を確認してください。",
        authFailed: "認証に失敗しました。API接続を確認してください。",
        enterAdminPassword: "パスワードを入力してください。",
        authInProgress: "認証中...",
        incorrectPassword: "パスワードが正しくありません。"
      },
      alerts: {
        loginMissingCredentials: "IDとパスワードを入力してください。",
        loginFailed: "ログインに失敗しました。登録済みユーザのID/パスワードを確認してください。",
        themeHistoryLoadFailed: "テーマ履歴の取得に失敗しました。サーバー状態を確認してください。",
        enterTitle: "タイトルを入力してください。",
        themeSaveFailedRetry: "テーマ保存に失敗しました。時間をおいて再実行してください。",
        selectThemeToDelete: "削除するテーマを選択してください。",
        themeDeleteFailed: "テーマ削除に失敗しました。",
        clearHistoryFailed: "履歴全削除に失敗しました。",
        enterWord: "単語を入力してください",
        selectNodeToDelete: "削除するノードを選択してください。",
        failedGetDeleteNode: "削除対象ノードを取得できませんでした。",
        selectTwoNodes: "2つのノードを選択してください。",
        edgeNotFoundBetweenNodes: "選択されたノード間にエッジが存在しません。",
        selectAtLeastOneNode: "少なくとも1つのノードを選択してください。",
        hypothesisProcessFailed: "仮説追加の処理中にエラーが発生しました。ページを再読み込みしてください。",
        enterHypothesisToAdd: "追加する仮説の内容を入力してください。",
        mindmapUnavailable: "マインドマップが利用できません。ページを再読み込みしてください。",
        noMindmapParent: "マインドマップに親ノードがありません。",
        emptyHypothesis: "仮説が空です。",
        mindmapNodeAddFailed: "ノードの追加に失敗しました。",
        enterHypothesis: "仮説を入力してください。",
        questionFetchFailed: "質問が取得できませんでした。",
        apiCallFailed: "API呼び出し中にエラーが発生しました: {message}",
        mindmapDbUserMissing: "ユーザー「{userId}」がDBに存在しないため、仮説関係性マップのDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。",
        hypothesisDbUserMissing: "ユーザー「{userId}」がDBに存在しないため、仮説のDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。",
        enterNodeName: "ノード名を入力してください。",
        cannotDeleteTitleNode: "タイトルノードは削除できません。"
      },
      errors: {
        xmlExistsCheckFailed: "XML存在確認に失敗しました",
        initialXmlCreateFailed: "初期XMLの作成に失敗しました",
        themeHistoryFetchFailed: "テーマ履歴の取得に失敗しました",
        themeSaveFailed: "テーマの保存に失敗しました",
        themeDeleteFailed: "テーマ削除に失敗しました",
        themeClearFailed: "履歴削除に失敗しました"
      },
      confirms: {
        deleteTheme: "「{theme}」を削除します。よろしいですか？",
        clearThemeHistory: "テーマ履歴をすべて削除します。よろしいですか？",
        reopenSideView: "本当に整理は終わりましたか？",
        deleteTag: "「{tag}」タグを削除しますか？",
        deleteNodesHeader: "以下の {count} 件のノードを削除します。",
        deleteNodesFooter: "本当に削除してよいですか？"
      },
      prompts: {
        editNodeLabel: "ノードのラベルを変更",
        editEdgeLabel: "エッジのラベルを変更",
        editMindmapNodeText: "ノードのテキストを変更:",
        addMindmapNodeText: "追加するノードのテキスト:"
      },
      labels: {
        noLabel: "(ラベルなし)",
        undefined: "(未定義)",
        noKeywords: "(キーワードなし)",
        rootPrefix: "(ルート)",
        untitledNode: "(無題ノード)",
        basedKeywords: "基づくキーワード: {keywords}",
        hypothesisNumber: "仮説 #{index}",
        generatedKeywordHeader: "生成されたキーワード",
        mapNodeAddTitle: "マインドマップにノードを追加",
        selectParentNode: "親ノードを選択",
        hypothesisToAdd: "追加する仮説",
        selectQuestion: "質問を選択してください"
      },
      placeholders: {
        hypothesisInput: "ここに仮説を入力",
        scamperInput: "発散させた仮説を記入してください"
      },
      buttons: {
        delete: "削除",
        addNode: "仮説を追加",
        expandHypothesis: "仮説を発散",
        cancel: "キャンセル",
        add: "追加"
      },
      loading: {
        thinking: "思考中..."
      },
      search: {
        entityIdLabel: "エンティティ ID:",
        notFound: "エンティティが見つかりませんでした。"
      },
      defaults: {
        newNode: "新しいノード",
        newEdge: "新しいリンク",
        newMindmapTitle: "新しいマインドマップ",
        unsetTheme: "未設定のテーマ"
      },
      logs: {
        systemStart: "システム起動: main.html を開きました (ユーザ: {userName}, タイトル: {title})",
        showSideView: "画面: 左サイドビュー表示",
        hideSideView: "画面: 左サイドビューを閉じる",
        mapCenterNoNodes: "キーワードマップ: 中央表示（ノードなし）",
        mapCenter: "キーワードマップ: 中央表示",
        hypothesisRestored: "仮説: 復元しました",
        hypothesisDeleted: "仮説: 削除"
      },
      hypothesis: {
        helpText: "「仮説を追加」ボタンを押すとこの中に新しい仮説が追加されます。"
      },
      scamper: {
        substitute: "置換 (Substitute)",
        combine: "結合 (Combine)",
        adapt: "適応 (Adapt)",
        modify: "修正 (Modify)",
        putToOtherUse: "転用 (Put to other use)",
        eliminate: "削除 (Eliminate)",
        reverse: "再構成 (Reverse)",
        templateSubstitute: "何かを別のもので置き換えることで新しい解決策が得られるか検討する。",
        templateCombine: "他の要素と結合して性能や価値を高められないか検討する。",
        templateAdapt: "他分野のアイデアを適用できないか検討する。",
        templateModify: "形状・大きさ・性質を変更して改善できないか検討する。",
        templatePutToOtherUse: "別用途に転用することで新たな価値が生まれないか検討する。",
        templateEliminate: "不要な要素を削除して簡素化やコスト削減が図れないか検討する。",
        templateReverse: "順序や役割を入れ替えることで新しい発想が生まれないか検討する。"
      },
      keyword: {
        fetchGeneratedFailed: "生成キーワードを取得できませんでした。",
        fetchFailed: "キーワードを取得できませんでした。"
      }
    },
    en: {
      title: {
        index: "Exploration Support System",
        themeSelect: "Select Theme - Exploration Support System",
        main: "Inquiry Support System",
        userAdmin: "User Administration"
      },
      common: {
        guest: "Guest",
        unset: "Not set",
        language: "Language",
        japanese: "Japanese",
        english: "English",
        passwordPlaceholder: "Password"
      },
      admin: {
        menuAria: "Admin menu",
        choose: "Select admin page",
        userAdmin: "User admin"
      },
      login: {
        heading: "Please sign in",
        usernamePlaceholder: "User ID",
        passwordPlaceholder: "Password",
        button: "Sign in"
      },
      theme: {
        switcherAria: "Display theme switcher",
        label: "Theme",
        sky: "Sky",
        forest: "Forest",
        sunset: "Sunset",
        slate: "Slate",
        optionTitle: "{theme} theme",
        optionAria: "Switch to {theme} theme"
      },
      themeSelect: {
        heading: "Enter or choose a theme to work on",
        historyLabel: "Theme history",
        historyAria: "Theme history",
        deleteSelected: "Delete selected theme",
        clearHistory: "Clear history",
        newThemeLabel: "New theme",
        newThemePlaceholder: "Enter a new exploration theme",
        startButton: "Start exploration"
      },
      main: {
        titlePlaceholder: "Enter exploration theme",
        showSideView: "Show side view",
        hideSideView: "Hide side view",
        log: "Log",
        keywordArea: "Keyword generation area",
        generate: "Generate",
        generatedKeywords: "Generated keywords",
        mapArea: "Keyword map area",
        recenterTitle: "Center map",
        addKeyword: "Add keyword",
        deleteKeyword: "Delete keyword",
        addLink: "Add link",
        deleteLink: "Delete link",
        createHypothesis: "Add Hypothesis",
        enableArrows: "Enable arrows",
        hypothesisArea: "Hypothesis expansion area",
        hypothesisMap: "Hypothesis relation map"
      },
      userAdmin: {
        authHeading: "User Administration",
        authDescription: "Enter the password to access this page.",
        openAdmin: "Open admin page",
        backToLogin: "Back to login",
        openPhpMyAdmin: "Open phpMyAdmin",
        protectedHeading: "User Management",
        newUserIdPlaceholder: "User ID (alphanumeric / 3-32 chars)",
        newUserPasswordPlaceholder: "Password",
        createUser: "Create user",
        selectTargetUser: "Select target user ID",
        currentPasswordPlaceholder: "Current password",
        updatedPasswordPlaceholder: "New password",
        updatePassword: "Update password",
        refreshUsers: "Refresh user list",
        userListHeading: "Registered users",
        userListHint: "Right-click a user ID to delete the account.",
        noUsers: "No users are registered.",
        rightClickDelete: "Right-click to delete",
        deletingUser: "Deleting user \"{userId}\"...",
        deleteUserFailed: "Failed to delete user.",
        userDeleted: "Deleted user \"{userId}\".",
        confirmDeleteUser: "Delete user \"{userId}\"?\nProceed?",
        fetchingUsers: "Loading user list...",
        fetchUsersFailed: "Failed to load user list.",
        usersUpdated: "User list updated ({count}).",
        enterUserAndPassword: "Enter user ID and password.",
        creatingUser: "Creating user...",
        createUserFailed: "Failed to create user.",
        userCreated: "Created user \"{userId}\".",
        enterPasswordUpdateFields: "Enter target user ID, current password, and new password.",
        updatingPassword: "Updating password...",
        updatePasswordFailed: "Failed to update password.",
        passwordUpdated: "Updated password for \"{userId}\".",
        authTimeout: "Connection to auth server timed out. Please try again.",
        authServerUnavailable: "Cannot connect to auth server. Check server status.",
        authFailed: "Authentication failed. Check API connectivity.",
        enterAdminPassword: "Enter password.",
        authInProgress: "Authenticating...",
        incorrectPassword: "Incorrect password."
      },
      alerts: {
        loginMissingCredentials: "Enter user ID and password.",
        loginFailed: "Sign-in failed. Check your registered user ID/password.",
        themeHistoryLoadFailed: "Failed to load theme history. Check server status.",
        enterTitle: "Enter a title.",
        themeSaveFailedRetry: "Failed to save theme. Please try again later.",
        selectThemeToDelete: "Select a theme to delete.",
        themeDeleteFailed: "Failed to delete theme.",
        clearHistoryFailed: "Failed to clear history.",
        enterWord: "Enter a word.",
        selectNodeToDelete: "Select nodes to delete.",
        failedGetDeleteNode: "Failed to resolve nodes to delete.",
        selectTwoNodes: "Select two nodes.",
        edgeNotFoundBetweenNodes: "No edge exists between selected nodes.",
        selectAtLeastOneNode: "Select at least one node.",
        hypothesisProcessFailed: "An error occurred while creating hypotheses. Reload the page.",
        enterHypothesisToAdd: "Enter the hypothesis text to add.",
        mindmapUnavailable: "Mindmap is unavailable. Reload the page.",
        noMindmapParent: "No parent node exists in the mindmap.",
        emptyHypothesis: "Hypothesis is empty.",
        mindmapNodeAddFailed: "Failed to add node.",
        enterHypothesis: "Enter a hypothesis.",
        questionFetchFailed: "Failed to fetch questions.",
        apiCallFailed: "API call failed: {message}",
        mindmapDbUserMissing: "User \"{userId}\" is not found in DB, so saving hypothesis relation map was skipped.\nPlease sign in again (auth_user / host).",
        hypothesisDbUserMissing: "User \"{userId}\" is not found in DB, so saving hypotheses was skipped.\nPlease sign in again (auth_user / host).",
        enterNodeName: "Enter a node name.",
        cannotDeleteTitleNode: "The title node cannot be deleted."
      },
      errors: {
        xmlExistsCheckFailed: "Failed to check XML existence",
        initialXmlCreateFailed: "Failed to create initial XML",
        themeHistoryFetchFailed: "Failed to fetch theme history",
        themeSaveFailed: "Failed to save theme",
        themeDeleteFailed: "Failed to delete theme",
        themeClearFailed: "Failed to clear history"
      },
      confirms: {
        deleteTheme: "Delete \"{theme}\"?",
        clearThemeHistory: "Delete all theme history?",
        reopenSideView: "Are you sure your organizing work is finished?",
        deleteTag: "Delete tag \"{tag}\"?",
        deleteNodesHeader: "Delete {count} node(s):",
        deleteNodesFooter: "Are you sure?"
      },
      prompts: {
        editNodeLabel: "Edit node label",
        editEdgeLabel: "Edit edge label",
        editMindmapNodeText: "Edit node text:",
        addMindmapNodeText: "Text for new node:"
      },
      labels: {
        noLabel: "(no label)",
        undefined: "(undefined)",
        noKeywords: "(no keywords)",
        rootPrefix: "(root)",
        untitledNode: "(untitled node)",
        basedKeywords: "Based keywords: {keywords}",
        hypothesisNumber: "Hypothesis #{index}",
        generatedKeywordHeader: "Generated keywords",
        mapNodeAddTitle: "Add node to mindmap",
        selectParentNode: "Select parent node",
        hypothesisToAdd: "Hypothesis to add",
        selectQuestion: "Please select a question"
      },
      placeholders: {
        hypothesisInput: "Enter hypothesis here",
        scamperInput: "Enter expanded hypothesis"
      },
      buttons: {
        delete: "Delete",
        addNode: "Add Hypothesis",
        expandHypothesis: "Expand hypothesis",
        cancel: "Cancel",
        add: "Add"
      },
      loading: {
        thinking: "Thinking..."
      },
      search: {
        entityIdLabel: "Entity ID:",
        notFound: "No entity found."
      },
      defaults: {
        newNode: "New Node",
        newEdge: "New Edge",
        newMindmapTitle: "New Mindmap",
        unsetTheme: "Untitled Theme"
      },
      logs: {
        systemStart: "System start: opened main.html (user: {userName}, title: {title})",
        showSideView: "UI: left side view shown",
        hideSideView: "UI: left side view hidden",
        mapCenterNoNodes: "Keyword map: centered (no nodes)",
        mapCenter: "Keyword map: centered",
        hypothesisRestored: "Hypothesis: restored",
        hypothesisDeleted: "Hypothesis: deleted"
      },
      hypothesis: {
        helpText: "Press the \"Add Hypothesis\" button to add new hypotheses here."
      },
      scamper: {
        substitute: "Substitute",
        combine: "Combine",
        adapt: "Adapt",
        modify: "Modify",
        putToOtherUse: "Put to other use",
        eliminate: "Eliminate",
        reverse: "Reverse",
        templateSubstitute: "Consider whether replacing something with another element can produce a new solution.",
        templateCombine: "Consider whether combining with other elements can improve performance or value.",
        templateAdapt: "Consider whether ideas from another domain can be applied.",
        templateModify: "Consider whether changing shape, size, or properties can improve outcomes.",
        templatePutToOtherUse: "Consider whether a different use can create new value.",
        templateEliminate: "Consider whether removing unnecessary elements can simplify or reduce cost.",
        templateReverse: "Consider whether reversing order or roles can create new ideas."
      },
      keyword: {
        fetchGeneratedFailed: "Could not retrieve generated keywords.",
        fetchFailed: "Could not retrieve keywords."
      }
    }
  };

  const getByPath = (obj, path) => {
    if (!obj || !path) return undefined;
    return String(path)
      .split(".")
      .reduce((value, key) => (value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), obj);
  };

  const interpolate = (template, vars) =>
    String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
      const value = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : undefined;
      return value === undefined || value === null ? "" : String(value);
    });

  const resolveLanguage = (language) => {
    const normalized = String(language || "").toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(normalized)) {
      return normalized;
    }
    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("ja")) return "ja";
    return DEFAULT_LANGUAGE;
  };

  const detectBrowserLanguage = () => resolveLanguage(navigator.language || navigator.userLanguage);

  let currentLanguage = resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || detectBrowserLanguage());

  const t = (key, vars = {}, fallback = "") => {
    const target = getByPath(MESSAGES[currentLanguage], key);
    const jaFallback = getByPath(MESSAGES.ja, key);
    const template =
      typeof target === "string"
        ? target
        : typeof jaFallback === "string"
          ? jaFallback
          : fallback || key;
    return interpolate(template, vars);
  };

  const applyTranslations = (root = document) => {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (!key) return;
      element.textContent = t(key);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      if (!key) return;
      element.setAttribute("placeholder", t(key));
    });

    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      const key = element.getAttribute("data-i18n-title");
      if (!key) return;
      element.setAttribute("title", t(key));
    });

    root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      const key = element.getAttribute("data-i18n-aria-label");
      if (!key) return;
      element.setAttribute("aria-label", t(key));
    });

    root.querySelectorAll("[data-i18n-value]").forEach((element) => {
      const key = element.getAttribute("data-i18n-value");
      if (!key) return;
      element.setAttribute("value", t(key));
    });
  };

  const syncLanguageControls = () => {
    document.querySelectorAll("[data-language-control]").forEach((control) => {
      if (control.value !== currentLanguage) {
        control.value = currentLanguage;
      }
    });
  };

  const bindLanguageControls = () => {
    document.querySelectorAll("[data-language-control]").forEach((control) => {
      if (control.dataset.languageBound === "true") return;
      control.addEventListener("change", () => {
        applyLanguage(control.value, true);
      });
      control.dataset.languageBound = "true";
    });
  };

  const applyLanguage = (language, persist = true) => {
    currentLanguage = resolveLanguage(language);
    document.documentElement.setAttribute("lang", currentLanguage);
    document.documentElement.setAttribute("data-language", currentLanguage);
    if (persist) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
    }

    bindLanguageControls();
    applyTranslations(document);
    syncLanguageControls();

    window.dispatchEvent(
      new CustomEvent("app-language-changed", {
        detail: { language: currentLanguage },
      })
    );

    return currentLanguage;
  };

  window.APP_I18N = {
    LANGUAGE_STORAGE_KEY,
    t,
    getLanguage: () => currentLanguage,
    applyLanguage,
    applyTranslations,
    resolveLanguage,
  };

  const initializeI18n = () => {
    bindLanguageControls();
    applyLanguage(currentLanguage, false);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeI18n);
  } else {
    initializeI18n();
  }
})();
