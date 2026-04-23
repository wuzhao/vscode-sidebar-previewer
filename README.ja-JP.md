# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.4-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Language: [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文-台灣](./README.zh-TW.md) | [繁體中文-香港](./README.zh-HK.md) | [日本語](./README.ja-JP.md)

VS Code のアクティビティバーで、リアルタイム描画・スクロール同期・ズーム操作を実現します。Markdown、LaTeX、Mermaid、JSON、YAML、TOML に対応しています。

## なぜ必要ですか？

AI 主導の開発時代において、ドキュメンテーションは今や主要な要素となり、ローカルで処理され、リポジトリ内で直接バージョン管理されるようになりました。セカンダリー・サイドバーがAIワークフローの主流ハブへと進化する中、従来のプレビュー手法は窮屈で扱いにくく感じられます。そこで登場したのが **Sidebar Previewer** です。サイドバー内でのリアルタイム・レンダリングを実現し、コーディングとプレビューの流れるような切り替えを可能にするほか、ワークフロー全体をカバーするプレゼンテーションモードも備えています。

## プロジェクトリポジトリ

GitHub: [https://github.com/wuzhao/vscode-sidebar-previewer](https://github.com/wuzhao/vscode-sidebar-previewer)

## スクリーンショット

| Type | Screenshot |
| ---- | ---------- |
| Markdown | ![Markdown Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/markdown.png) |
| LaTeX | ![Latex Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/latex.png) |
| Mermaid | ![Mermaid Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/mermaid.png) |
| JSON&nbsp;/&nbsp;YAML&nbsp;/&nbsp;TOML | ![YAML Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/yaml.png) |

## 対応ファイル

| Type | Extensions |
| ---- | ---------- |
| Markdown | `.md`, `.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`, `.mermaid` |
| JSON | `.json` |
| YAML | `.yaml`, `.yml` |
| TOML | `.toml` |

## 機能概要

### Markdown

- フロントマター（Front matter）のテーブル表示
- GitHub Alert ブロックのレンダリング
- タスクリストのチェックボックス操作（トグル）とファイルへの書き戻し
- コードハイライトおよびコピーボタン
- KaTeX および Mermaid ブロックのレンダリング
- エディタとプレビュー間の同期スクロールおよび位置特定（双方向スクロール）

### LaTeX

- インライン数式および主要な数学環境の KaTeX レンダリング
- エディタとプレビュー間の同期スクロールおよび位置特定
- ズーム表示対応

### Mermaid

- 基本的な構文の事前チェックと、分かりやすいエラーフィードバック
- ズーム時のドラッグによるパン（移動）操作

### JSON / YAML / TOML

- 折りたたみ可能なツリー表示
- すべて展開 / すべて折りたたむ
- キー（項目）をクリックしてソース行へジャンプ
- JSON はコメントと末尾カンマを含む入力を解析可能
- コメント付きキーにはアイコンを表示し、ホバーで内容を確認可能

## インストール

### VS Code Marketplace からインストール

1. VS Code を開きます
2. 拡張機能ビューを開きます（Mac：`Cmd+Shift+X` / Windows・Linux：`Ctrl+Shift+X`）
3. `Sidebar Previewer` を検索します
4. `Sidebar Previewer` の「Install」をクリックします

> または拡張機能ページからインストールします：[Sidebar Previewer on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MG12.sidebar-previewer)

### ソースからビルドしてインストール

- リポジトリをクローンする：`git clone https://github.com/wuzhao/vscode-sidebar-previewer.git`
- プロジェクトフォルダに移動する：`cd vscode-sidebar-previewer`
- 依存関係をインストールする：`npm install`
- 拡張機能の出力とアセットをビルド（バンドル）する：`npm run package:vsix`
- VSIX ファイルをパッケージ化する：`npx @vscode/vsce package`
- VS Code で `Extensions: Install from VSIX` を実行し、生成された `sidebar-previewer-<version>.vsix` を選択する

## 使い方

1. サポートされているファイルを開く（`.md`、`.markdown`、`.tex`、`.mmd`、`.mermaid`、`.json`、`.jsonc`、`.yaml`、`.yml`、`.toml`）
2. アクティビティバーにある Sidebar Previewer アイコンをクリックする
3. プレビューパネルに現在のファイルが自動的に表示（レンダリング）される
4. ツールバーのボタン、または `Cmd/Ctrl` + マウスホイールでズーム操作を行う
5. Mermaid のプレビューでは、図をドラッグしてパン（移動）させる
6. JSON/YAML/TOML のプレビューでは、キーをクリックしてソース行へジャンプする

## VS Code のセカンダリサイドバーを表示するには？

1. コマンドパレットを開き、`View: Toggle Secondary Side Bar` を実行する
2. または、メニューの `View > Appearance > Secondary Side Bar` から選択する
3. 必要に応じて、Sidebar Previewer のビューをセカンダリー サイドバー領域へドラッグする

## 謝辞

- [marked](https://github.com/markedjs/marked)：Markdown をHTMLに解析し、プレビュー表示を実現しています。
- [mermaid](https://github.com/mermaid-js/mermaid)：Markdown 内の Mermaid ダイアグラム、および `.mmd/.mermaid` ファイルのレンダリングに使用しています。
- [katex](https://github.com/KaTeX/KaTeX)：Markdown およびLaTeXプレビューにおける数式のレンダリングに使用しています。
- [highlight.js](https://github.com/highlightjs/highlight.js)：コードブロックの構文ハイライト（シンタックスハイライト）を提供しています。
- [js-yaml](https://github.com/nodeca/js-yaml)：YAMLデータを解析し、構造化プレビューを表示します。
- [toml](https://github.com/BinaryMuse/toml-node)：TOMLデータを解析し、構造化プレビューを表示します。

## ライセンス

MIT
