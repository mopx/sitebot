import { Hono } from "hono";
import type { Env } from "./env.js";
import { healthRoute } from "./routes/health.js";
import { chatRoute } from "./routes/chat.js";
import { whatsappRoute } from "./routes/whatsapp.js";
import { telegramRoute } from "./routes/telegram.js";
import { adminRoute } from "./routes/admin.js";

export { ConversationDO } from "./durable/conversation.js";
export { BudgetDO } from "./durable/budget.js";

const app = new Hono<{ Bindings: Env }>();

app.route("/", healthRoute);
app.route("/", chatRoute);
app.route("/", whatsappRoute);
app.route("/", telegramRoute);
app.route("/", adminRoute);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
