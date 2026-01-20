
/**
 * СУПЕРМОЗГ: ИСПРАВЛЕННЫЙ GOOGLE SCRIPT (Замените ваш doPost этим кодом)
 * 
 * function doPost(e) {
 *   var p = e.parameter; // Читаем данные из URL (самый надежный способ)
 *   var sheetLeads = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
 *   var sheetSessions = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
 *   
 *   if (p.type === 'order' || p.type === 'lead') {
 *     sheetLeads.appendRow([
 *       p.product || '', p.price || 0, p.name || '', p.email || '', p.phone || '',
 *       p.utmSource || 'direct', p.orderId || '', p.dateStr || new Date().toLocaleString('ru-RU'),
 *       p.paymentStatus || 'pending', p.agreedToMarketing || 'Нет', p.tgUsername || 'no_id', p.productId || ''
 *     ]);
 *   } else {
 *     sheetSessions.appendRow([
 *       p.dateStr || new Date().toLocaleString('ru-RU'), 
 *       p.tgUsername || '---', // Кладем ID сюда, чтобы он был виден вместо ---
 *       p.username || '---',   // И сюда для верности
 *       p.utmSource || 'direct', 
 *       'none', 'none', p.utmSource || 'direct', 'none', 'none'
 *     ]);
 *   }
 *   return ContentService.createTextOutput("Success");
 * }
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v6';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz10cekQSLd-wYMGnxGPJ-gnIGD6eKs-DQUEmFsX-EOQ3vtBNoHXmOI9h0xsLSIzdg/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Пытаемся взять из официального объекта
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. ГЛУБОКИЙ ПАРСИНГ: Если SDK еще не проснулся, выгрызаем ID из URL
    if (!userId) {
      const rawData = tg?.initData || new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
      if (rawData) {
        // Ищем ID в формате JSON или URL-encoded
        const idMatch = rawData.match(/id%22%3A(\d+)/) || rawData.match(/"id":(\d+)/) || rawData.match(/id=(\d+)/);
        if (idMatch) userId = idMatch[1];
        const userMatch = rawData.match(/username%22%3A%22([^%"]+)/) || rawData.match(/"username":"([^"]+)"/) || rawData.match(/username=([^&]+)/);
        if (userMatch) username = `@${userMatch[1]}`;
      }
    }

    // 3. Кэш-память
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

    // Вместо Unknown генерируем метку устройства, если Telegram совсем не отдает данные
    const finalId = userId || `DEV_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, 
      tg_id: userId || finalId,
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ERROR', tg_id: 'none', username: 'none', displayName: 'User' };
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

// МЕТОД СУПЕРМОЗГА: Дублируем данные в URL параметры
const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  
  try {
    const params = new URLSearchParams();
    for (const key in payload) {
      const val = payload[key];
      // Принудительно заменяем пустые значения на ID пользователя
      params.append(key, (val === undefined || val === null || val === '---' || val === '') ? (payload.tgUsername || '---') : String(val));
    }

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.toString()}`;

    // Отправляем POST, но данные Google Script заберет из ссылки (params)
    await fetch(finalUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache'
    });
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

export const analyticsService = {
  logOrder: async (order: any, currentSessionId?: string) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);

    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: `${order.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
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
      type: 'order_update',
      action: 'update_status',
      orderId: orderId,
      paymentStatus: status === 'paid' ? 'success' : 'failed',
      tgUsername: userInfo.primaryId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedId?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedId || userInfo.primaryId;
    const sessionId = `${tgId.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
    globalSessionId = sessionId;
    
    await sendToScript({
      type: 'session_start',
      dateStr: formatNow(),
      // ДУБЛИРУЕМ ID в city и country, чтобы в таблице точно было видно КТО зашел
      city: tgId, 
      country: userInfo.username, 
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
      city: userInfo.primaryId,
      country: userInfo.username,
      path: path,
      sessionId: sessionId || globalSessionId,
      tgUsername: userInfo.primaryId
    });
  }
};
