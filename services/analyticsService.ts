
/**
 * СОВЕТ ОТ СУПЕРМОЗГА ДЛЯ ВАШЕГО GOOGLE SCRIPT (в таблице):
 * 
 * Если данные не приходят, убедитесь, что функция в Google Script выглядит так:
 * 
 * function doPost(e) {
 *   var param = e.parameter;
 *   var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Название_Листа");
 *   sheet.appendRow([new Date(), param.email, param.username, param.tg_id, param.type, param.path]);
 *   return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
 * }
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v4';
const BROWSER_ID_KEY = 'olga_browser_fingerprint_v4';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

// Генерация ID устройства, если Telegram молчит
const getBrowserFingerprint = () => {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = 'DEV_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
};

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Извлекаем из объекта SDK
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. СУПЕР-ЗАХВАТ: Парсим все возможные строки данных (initData, hash, search)
    if (!userId) {
      const fullSource = decodeURIComponent(tg?.initData || '') + decodeURIComponent(window.location.hash) + decodeURIComponent(window.location.search);
      
      // Ищем ID (цифры)
      const idMatch = fullSource.match(/"id":(\d+)/) || fullSource.match(/id=(\d+)/) || fullSource.match(/id%22%3A(\d+)/);
      if (idMatch && idMatch[1]) userId = idMatch[1];
      
      // Ищем Username
      const userMatch = fullSource.match(/"username":"([^"]+)"/) || fullSource.match(/username=([^&]+)/) || fullSource.match(/username%22%3A%22([^%"]+)/);
      if (userMatch && userMatch[1]) username = `@${userMatch[1]}`;
    }

    // 3. Кэширование
    const fingerprint = getBrowserFingerprint();
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

    // Гарантируем отсутствие "Unknown"
    const finalId = userId || fingerprint;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, 
      tg_id: userId || 'none',
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ERROR_GETTING_ID', tg_id: 'none', username: 'none', displayName: 'User' };
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

// МЕТОД МИРОВОГО СУПЕРМОЗГА: Отправка данных через URL-параметры
const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  
  try {
    // Формируем строку параметров (query string)
    const params = new URLSearchParams();
    for (const key in payload) {
      // Заменяем пустые значения на понятные маркеры, чтобы в таблице не было пустоты
      const val = payload[key];
      params.append(key, (val === null || val === undefined || val === '') ? '---' : String(val));
    }

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.toString()}`;

    // Используем POST, но данные дублируем в URL для 100% срабатывания в Google
    await fetch(finalUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache'
    });
  } catch (e) {
    console.error('Analytics error:', e);
  }
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

export const analyticsService = {
  logOrder: async (order: Omit<OrderLog, 'id' | 'timestamp' | 'paymentStatus'>, currentSessionId?: string) => {
    const timestamp = Date.now();
    const userInfo = getDetailedTgUser();
    const newOrder: OrderLog = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      tgUsername: userInfo.primaryId,
      paymentStatus: 'pending'
    };

    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'order_sess',
      orderId: newOrder.id,
      name: `${newOrder.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
      username: userInfo.username,
      tg_id: userInfo.tg_id,
      product: newOrder.productTitle,
      price: newOrder.price,
      utmSource: newOrder.utmSource,
      dateStr: formatNow()
    });
    
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: 'paid' | 'failed') => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      action: 'update_status',
      type: 'order',
      orderId: orderId,
      status: status,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedUsername?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedUsername || userInfo.primaryId;
    
    const safeId = String(tgId).replace(/[^a-zA-Z0-9]/g, '') || 'user';
    const sessionId = `${safeId}_${Math.random().toString(36).substr(2, 4)}`;
    globalSessionId = sessionId;
    
    const params = new URLSearchParams(window.location.search);
    
    await sendToScript({
      action: 'log',
      type: 'session_start',
      sessionId: sessionId,
      name: userInfo.displayName,
      email: tgId,
      tgUsername: tgId,
      tg_id: userInfo.tg_id,
      username: userInfo.username,
      utmSource: params.get('utm_source') || 'direct',
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    const userInfo = getDetailedTgUser();
    const sId = sessionId && sessionId !== 'session' ? sessionId : (globalSessionId || 'path_sess');
    
    await sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sId,
      name: userInfo.displayName,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      tg_id: userInfo.tg_id,
      path: path,
      dateStr: formatNow()
    });
  }
};
