# 小管家 Cloudflare API 测试文档

本文档提供 API 接口的测试方法和示例。

---

## 基础信息

- **基础 URL**: `https://your-project.pages.dev`
- **会话 Cookie**: 登录后通过 `xgj_session` cookie 传递
- **Content-Type**: `application/json`

---

## 认证相关 API

### 1. 注册账户

**请求**:
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "Password123",
  "remember": true
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "userId": "uuid-or-id",
    "username": "testuser"
  }
}
```

### 2. 登录

**请求**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "Password123",
  "remember": true
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "username": "testuser"
  }
}
```

**重要**: 登录成功后，响应头中会设置 `Set-Cookie: xgj_session=<token>`，后续请求需携带此 Cookie。

### 3. 获取当前用户

**请求**:
```bash
GET /api/auth/me
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "userId": "xxx",
    "username": "testuser"
  }
}
```

### 4. 登出

**请求**:
```bash
POST /api/auth/logout
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {}
}
```

---

## 账单相关 API

### 1. 获取账单列表

**请求**:
```bash
GET /api/transactions?month=2026-10&type=expense&categoryId=xxx
Cookie: xgj_session=<token>
```

**参数**:
- `month` (可选): 格式 `YYYY-MM`
- `start` (可选): 起始日期 `YYYY-MM-DD`
- `end` (可选): 结束日期 `YYYY-MM-DD`
- `type` (可选): `expense` 或 `income`
- `categoryId` (可选): 分类 ID
- `accountId` (可选): 账户 ID
- `supplierId` (可选): 供应商 ID
- `keyword` (可选): 关键词搜索

**响应**:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "xxx",
        "type": "expense",
        "amount": 10000,
        "categoryId": "cat_1",
        "accountId": "acc_1",
        "supplierId": "sup_1",
        "date": "2026-10-30",
        "note": "测试账单",
        "created_at": "2026-10-30T10:00:00Z"
      }
    ],
    "expense": 15000,
    "income": 20000
  }
}
```

### 2. 记一笔（新增）

**请求**:
```bash
POST /api/transactions
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "type": "expense",
  "amount": 10000,
  "categoryId": "cat_1",
  "accountId": "acc_1",
  "date": "2026-10-30",
  "note": "测试账单",
  "supplierId": "sup_1"
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "tx_123456",
    "type": "expense",
    "amount": 10000,
    "categoryId": "cat_1",
    "accountId": "acc_1",
    "date": "2026-10-30",
    "note": "测试账单",
    "created_at": "2026-10-30T10:00:00Z"
  }
}
```

### 3. 编辑账单

**请求**:
```bash
PATCH /api/transactions/{id}
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "type": "expense",
  "amount": 12000,
  "categoryId": "cat_1",
  "accountId": "acc_1",
  "date": "2026-10-30",
  "note": "更新后的测试账单",
  "supplierId": "sup_1"
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "tx_123456",
    "type": "expense",
    "amount": 12000,
    "categoryId": "cat_1",
    "accountId": "acc_1",
    "date": "2026-10-30",
    "note": "更新后的测试账单",
    "supplierId": "sup_1"
  }
}
```

### 4. 软删除账单

**请求**:
```bash
DELETE /api/transactions/{id}
Cookie: xgj_session=<token>
```

**查询参数**:
- `purge=1` (可选): 彻底删除（包括图片），否则软删除

**响应**:
```json
{
  "ok": true,
  "data": {}
}
```

### 5. 恢复账单

**请求**:
```bash
POST /api/transactions/{id}/restore
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {}
}
```

---

## 分类管理 API

### 1. 获取分类列表

**请求**:
```bash
GET /api/categories?type=expense
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": [
    {
      "id": "cat_1",
      "name": "餐饮",
      "icon": "🍔",
      "type": "expense",
      "sort": 1,
      "status": "active",
      "isDefault": false
    }
  ]
}
```

### 2. 添加分类

**请求**:
```bash
POST /api/categories
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "交通",
  "type": "expense",
  "icon": "🚗"
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "cat_2",
    "name": "交通",
    "icon": "🚗",
    "type": "expense"
  }
}
```

### 3. 重命名分类

**请求**:
```bash
PATCH /api/categories/{id}
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "交通出行"
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "cat_2",
    "name": "交通出行"
  }
}
```

### 4. 停用/启用分类

**请求**:
```bash
PATCH /api/categories/{id}
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "status": "inactive"
}
```

---

## 供应商管理 API

### 1. 获取供应商列表

**请求**:
```bash
GET /api/suppliers
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": [
    {
      "id": "sup_1",
      "name": "全家便利店",
      "status": "active"
    }
  ]
}
```

### 2. 添加供应商

**请求**:
```bash
POST /api/suppliers
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "美团外卖"
}
```

### 3. 重命名供应商

**请求**:
```bash
PATCH /api/suppliers/{id}
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "美团优选"
}
```

### 4. 确保供应商（自动创建）

**请求**:
```bash
POST /api/suppliers/ensure
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "便利店"
}
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "sup_new",
    "name": "便利店"
  }
}
```

---

## 账户管理 API

### 1. 获取账户列表

**请求**:
```bash
GET /api/accounts
Cookie: xgj_session=<token>
```

### 2. 添加账户

**请求**:
```bash
POST /api/accounts
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "name": "微信钱包",
  "icon": "💚"
}
```

---

## 预算管理 API

### 1. 获取预算状态

**请求**:
```bash
GET /api/budgets/{month}
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "budget": 5000,
    "used": 3200,
    "remaining": 1800,
    "pct": 0.64,
    "daysLeft": 15,
    "dailyAvailable": 120
  }
}
```

### 2. 设置预算

**请求**:
```bash
PUT /api/budgets/{month}
Content-Type: application/json
Cookie: xgj_session=<token>

{
  "amount": 5000
}
```

### 3. 清除预算

**请求**:
```bash
DELETE /api/budgets/{month}
Cookie: xgj_session=<token>
```

---

## 统计 API

### 1. 获取月度统计

**请求**:
```bash
GET /api/stats/{month}
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "summary": {
      "expense": 15000,
      "income": 20000,
      "balance": 5000
    },
    "prevSummary": {
      "expense": 12000,
      "income": 18000,
      "balance": 6000
    },
    "categorySums": [
      {
        "id": "cat_1",
        "name": "餐饮",
        "cents": 5000
      }
    ],
    "supplierSums": [
      {
        "id": "sup_1",
        "name": "全家便利店",
        "cents": 3000
      }
    ],
    "dailySeries": [
      {
        "date": "2026-10-30",
        "cents": 1500
      }
    ],
    "sixMonth": [
      {
        "month": "2026-10",
        "expense": 15000
      }
    ]
  }
}
```

---

## 图片管理 API

### 1. 上传图片

**请求**:
```bash
POST /api/photos
Content-Type: multipart/form-data
Cookie: xgj_session=<token>

transactionId: tx_123456
files: <multipart file data>
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "photo_1",
    "transactionId": "tx_123456",
    "size": 15360
  }
}
```

### 2. 获取图片

**请求**:
```bash
GET /api/photos/{id}
Cookie: xgj_session=<token>
```

**响应**:
- 直接返回图片二进制数据

### 3. 删除图片

**请求**:
```bash
DELETE /api/photos/{id}
Cookie: xgj_session=<token>
```

**响应**:
```json
{
  "ok": true,
  "data": {}
}
```

---

## 导出功能

### 1. 导出 CSV

**请求**:
```bash
GET /api/export
Cookie: xgj_session=<token>
```

**响应**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="账单_2026-10-30.csv"`

---

## 错误响应

所有错误响应格式：

```json
{
  "ok": false,
  "msg": "错误描述"
}
```

### 常见错误码

- `401`: 未登录或登录过期
- `400`: 参数错误
- `403`: 无权限
- `429`: 频率限制
- `500`: 服务器内部错误

---

## 测试脚本示例

### 使用 curl 测试

```bash
# 1. 登录
TOKEN=$(curl -s -X POST https://your-project.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Password123","remember":true}' \
  -c cookies.txt | jq -r '.data.username')

echo "Logged in as: $TOKEN"

# 2. 获取账单列表
curl -X GET "https://your-project.pages.dev/api/transactions?month=2026-10" \
  -b cookies.txt | jq

# 3. 记一笔
curl -X POST https://your-project.pages.dev/api/transactions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "type": "expense",
    "amount": 100,
    "categoryId": "cat_1",
    "accountId": "acc_1",
    "date": "2026-10-30",
    "note": "API测试"
  }' | jq

# 4. 登出
curl -X POST https://your-project.pages.dev/api/auth/logout \
  -b cookies.txt | jq

# 清理
rm -f cookies.txt
```

---

## 注意事项

1. **所有请求都必须携带 `xgj_session` cookie**
2. **金额以「分」为单位存储**（如 10000 表示 100.00 元）
3. **图片存储在 R2，API 返回图片流**
4. **软删除的账单不会出现在统计中**
5. **预算提醒标记通过 KV 实现，可能存在秒级延迟**
