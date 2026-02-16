import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

const ARCJET_KEY = process.env.ARCJET_KEY;
const ARCJET_ENV = process.env.ARCJET_ENV;

if (!ARCJET_KEY) throw new Error("Arcjet Key is missing!");

export const httpArcjet = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      rules: [
        // Shield protects your app from common attacks e.g. SQL injection
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "DRY_RUN", // Blocks requests. Use "DRY_RUN" to log only
          // Block all bots except the following
          allow: [
            "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
            "CATEGORY:PREVIEW",
            "CURL",    // Allows curl requests
    "POSTMAN", // Allows Postman specifically
          ],
        }),
        slidingWindow({
          mode: "LIVE", // will block requests. Use "DRY_RUN" to log only
          interval: 10, // 60 second sliding window
          max: 50, // allow a maximum of 100 requests
        }),
      ],
    })
  : null;

export const wsArcjet = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      rules: [
        // Shield protects your app from common attacks e.g. SQL injection
        shield({ mode: "DRY_RUN" }),
        detectBot({
          mode: "LIVE", // Blocks requests. Use "DRY_RUN" to log only
          // Block all bots except the following
          allow: [
            "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
            "CATEGORY:PREVIEW",
          ],
        }),
        slidingWindow({
          mode: "LIVE", // will block requests. Use "DRY_RUN" to log only
          interval: 2, // 2 second sliding window
          max: 5, // allow a maximum of 5 requests
        }),
      ],
    })
  : null;

export const middleWare = async (req, res, next) => {
    //If we are missing arcjet key then there is no security layer so we dont want the user to get stuck, we want it directly proceed to the server.
  if (!httpArcjet) return next();
  try {
    const decision = await httpArcjet.protect(req);
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Too Many Requests" }));
      } else if (decision.reason.isBot()) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No bots allowed" }));
      } else {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
      }
      return
    }
    next()
  } catch (error) {
    console.error("Arcjet Middleware error", error);
    return res.status(503).json({ error: "Service unavailable" });
  }
};
