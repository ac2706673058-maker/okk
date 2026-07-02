# 三种方式变出 APK(按简单程度排序)

---

## 方式一:GitHub 云端编译(推荐,电脑不装任何软件)

原理:把工程传到 GitHub,它的服务器自动帮你编译,你只管下载 APK。
全程浏览器操作,约 15 分钟(大部分是等编译)。

### 步骤

1. **注册 GitHub**
   打开 github.com,注册账号(邮箱即可,免费)。

2. **建仓库**
   右上角 ➕ → New repository → 名字随便填(如 `tank`)→ 选 **Private**(私有)→ Create repository。

3. **上传工程**
   把下载的 zip 在电脑上**解压**。
   仓库页面点 "uploading an existing file" 链接 → 把解压出来的**所有文件和文件夹整体拖进去**(包括 `app` 文件夹、`build.gradle` 等)→ 底部点 **Commit changes**。

   ⚠️ 注意:`.github` 文件夹是隐藏文件夹,拖拽时可能漏掉。如果漏了,补救方法:
   仓库顶部点 **Actions** 标签 → "set up a workflow yourself" → 把工程里
   `.github/workflows/build.yml` 文件的内容粘贴进去 → Commit。

4. **等编译**
   上传完成后,点仓库顶部的 **Actions** 标签,会看到一个正在转圈的任务。
   等它变成绿色 ✅(约 3-5 分钟)。

5. **下载 APK**
   点进那个绿色任务 → 页面底部 **Artifacts** 区域 → 点 **BattleCity-APK** 下载。
   下载的是个 zip,解压得到 `app-debug.apk` —— 这就是成品。

6. **装进电视**
   APK 传夸克网盘或拷 U 盘 → 电视上打开安装。
   (电视需开启"允许安装未知来源应用":设置 → 系统/安全)

以后想改游戏:改 `app/src/main/assets/game.html` 后重新上传,自动重新编译。

---

## 方式二:Android Studio 本地编译(需下载约1GB软件)

1. 官网 developer.android.google.cn/studio 下载 Android Studio 并安装(一路下一步)
2. 打开 → Open → 选中解压后的工程文件夹
3. 等右下角进度条走完(首次会自动下载组件,需要网络,可能较慢)
4. 菜单 Build → Build App Bundle(s) / APK(s) → **Build APK(s)**
5. 右下角弹窗点 **locate**,APK 在 `app/build/outputs/apk/debug/` 里

---

## 方式三:不出 APK,直接浏览器玩(兜底方案)

电视上装一个支持手柄的浏览器(如 Firefox TV),打开 `坦克大战.html` 即可,
手柄走浏览器原生 Gamepad API。缺点:每次要先开浏览器,不如 APK 独立。

---

## 关于安装到电视后

- Xbox 手柄在**电视系统设置里蓝牙配对一次**,以后自动连
- 键位:十字键/左摇杆移动,A/X 开火,START 暂停,B 退出
- 电视遥控器也能玩:方向键 + OK 开火 + 菜单键暂停
