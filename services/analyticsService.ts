
/**
 * СУПЕРМОЗГ: ОПТИМИЗИРОВАННЫЙ GOOGLE SCRIPT (Скопируйте это в расширения таблицы)
 * 
 * function doPost(e) {
 *   var contents = JSON.parse(e.postData.contents);
 *   var sheetLeads = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
 *   var sheetSessions = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
 *   
 *   if (contents.type === 'lead' || contents.type === 'order') {
 *     sheetLeads.appendRow([
 *       contents.product || '', contents.price || 0, contents.name || '', contents.email || '', contents.phone || '',
 *       contents.utmSource || 'direct', contents.orderId || '', contents.dateStr || new Date().toLocaleString('ru-RU'),
 *       contents.paymentStatus || 'pending', contents.agreedToMarketing || 'Нет', contents.tgUsername || 'no_id', contents.productId || ''
 *     ]);
 *   } else if (contents.type === 'session_start' || contents.type === 'path_update') {
 *     sheetSessions.appendRow([
 *       contents.dateStr || new Date().toLocaleString('ru-RU'), contents.city || '---', contents.country || '---',
 *       contents.utmSource || 'direct', 'none', 'none', contents.utmSource || 'direct', 'none', 'none'
 *     ]);
 *   }
 *   return ContentService.createTextOutput("Success");
 * }
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v5';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbxEgb8enYLzE-tQObLX_3KDBicbrFY25E_9QHG9HijdssgviH8BeRzXd_HqQV4rEeQn/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Прямой захват из SDK
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Агрессивный захват из сырых данных (если SDK тупит)
    if (!userId) {
      const rawData = tg?.initData || new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
      if (rawData) {
        const idMatch = rawData.match(/id%22%3A(\d+)/) || rawData.match(/"id":(\d+)/);
        if (idMatch) userId = idMatch[1];
        const userMatch = rawData.match(/username%22%3A%22([^%"]+)/) || rawData.match(/"username":"([^"]+)"/);
        if (userMatch) username = `@${userMatch[1]}`;
      }
    }

    // 3. Восстановление из кэша
    if (userId) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        userId = c.userId;
        username = c.username;
        fullName = c.fullName;
      }
    }

    // Финальная проверка: если ID нет, используем временную метку, чтобы не было Unknown
    const finalId = userId || `ID_${Date.now().toString(36).toUpperCase()}`;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, 
      tg_id: userId || finalId,
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ERROR_SDK', tg_id: 'none', username: 'none', displayName: 'User' };
  }
};

const getWebhookUrl = () => {
  try {
    const config = localStorage.getItem('olga_tg_config');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.googleSheetWebhook) return parsed.googleSheetWebhook;
    }
  } catch (e) {}
  return DEFAULT_WEBHOOK;
};

// Отправка JSON-тела, которое на 100% понимает ваш Google Script
const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  
  try {
    // Чистим данные от возможных undefined
    const cleanPayload = JSON.parse(JSON.stringify(payload, (key, value) => {
      if (value === undefined || value === null || value === 'Unknown') return '---';
      return value;
    }));

    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanPayload)
    });
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

export const analyticsService = {
  logOrder: async (order: any, currentSessionId?: string) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);

    // ПОЛЯ СТРОГО ПО ВАШЕМУ СПИСКУ Leads
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: `${order.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId, // Для совместимости с вашей таблицей
      phone: order.customerPhone || '---',
      utmSource: order.utmSource || 'direct',
      orderId: orderId,
      dateStr: formatNow(),
      paymentStatus: 'pending',
      agreedToMarketing: order.agreedToMarketing ? 'Да' : 'Нет',
      tgUsername: userInfo.primaryId,
      productId: order.productId || '---'
    });
    
    return { ...order, id: orderId };
  },

  updateOrderStatus: async (orderId: string, status: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      action: 'update_status', // Для совместимости с логикой doPost
      order_id: orderId,
      payment_status: status === 'paid' ? 'success' : 'failed',
      tgUsername: userInfo.primaryId
    });
  },

  startSession: async (forcedId?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedId || userInfo.primaryId;
    const sessionId = `${tgId.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
    globalSessionId = sessionId;
    
    // ПОЛЯ СТРОГО ПО ВАШЕМУ СПИСКУ Sessions
    await sendToScript({
      type: 'session_start',
      dateStr: formatNow(),
      city: '---', // Ваш скрипт ждет это во 2-й колонке
      country: '---', // Ваш скрипт ждет это в 3-й колонке
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
      sessionId: sessionId,
      tgUsername: tgId
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      type: 'path_update',
      dateStr: formatNow(),
      city: '---',
      country: '---',
      path: path,
      sessionId: sessionId || globalSessionId,
      tgUsername: userInfo.primaryId
    });
  }
};
