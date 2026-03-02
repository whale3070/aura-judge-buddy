

# 在排名页面显示项目标题而非原始文件名

## 问题

当前排名页 `/ranking` 和 `/judge` 显示的是类似 `1772390869326399372_00_README.md` 的原始文件名，用户无法识别这是哪个项目。

## 方案

创建一个新的后端函数 `file-titles`，用于从外部后端获取提交列表并返回「文件名 -> 项目标题」的映射，然后在排名页面显示项目标题。

### 步骤

1. **添加 admin wallet 密钥**
   - 需要你提供外部后端的管理员钱包地址，存储为密钥 `ADMIN_WALLET`，供后端函数调用提交列表 API 使用。

2. **创建新的后端函数 `file-titles`**
   - 调用外部后端 `/api/submissions`（带 admin wallet 头），获取所有提交
   - 构建 `{file_name: project_title}` 映射并返回
   - 这是一个公开接口，仅返回文件名和标题的映射（不暴露其他敏感信息）

3. **新增 API 方法 `fetchFileTitles()`**
   - 在 `src/lib/api.ts` 中添加调用 `file-titles` 函数的方法
   - 返回 `Record<string, string>` 类型（文件名到标题的映射）

4. **更新 `RankingTable` 组件**
   - 接收 `titleMap` 属性
   - 在文件名旁显示对应的项目标题（标题为主，文件名为辅）

5. **更新使用排名表的页面**
   - `Ranking.tsx`: 加载时同时获取排名和标题映射
   - `MySubmission.tsx`: 同样显示项目标题
   - `Admin.tsx`: 在排名表中也显示标题

---

### 技术细节

**新建 `supabase/functions/file-titles/index.ts`**:
- 从环境变量读取 `ADMIN_WALLET`
- 请求 `http://198.55.109.102:8888/api/submissions`（带 `X-Admin-Wallet` 头）
- 遍历每个 submission 的 `md_files` 数组，建立 `file_name -> project_title` 映射
- 返回 JSON 对象

**修改 `RankingTable.tsx`**:
- 新增 `titleMap?: Record<string, string>` 属性
- 在表格中优先显示 `titleMap[file_name]`，若无则 fallback 到原始 `file_name`

