# 在 Mac Studio 上开工

iOS 的编译、运行和测试都在 Mac Studio 上做。代码通过 GitHub 在云端和 Mac 之间同步。

## 1. 拉代码

```bash
cd ~/Projects        # 换成你放项目的文件夹
git clone https://github.com/EngFook/ABPrice.git
```

以前拉过的话，进去更新就行：`cd ABPrice && git pull`

## 2. 打开 AI Office

```bash
cd ~/ai-office && npm start
```

## 3. 把任务卡加进 AI Office

```bash
~/Projects/ABPrice/office/add-tasks.sh ~/ai-office
```

两个路径都换成你 Mac 上的实际位置。已经加过的卡不会重复加。

## 4. 打开自动接单

在 AI Office 的任务板上打开 **Auto pickup**，Claude 或 Codex 会按优先级接手。代码任务需要另一个已登录的 Claude 或 Codex 来审核。

## 人在外面时

在 Mac Studio 的终端里进入项目文件夹，运行 `claude remote-control`。之后你在外面的设备上打开 Claude Code app，就能操作 Mac Studio 上的这个会话。
