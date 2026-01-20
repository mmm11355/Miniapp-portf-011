
/**
 * СУПЕРМОЗГ V21: ОКОНЧАТЕЛЬНАЯ СИНХРОНИЗАЦИЯ С ТАБЛИЦЕЙ
 * Фикс маппинга: название раздела -> Имя, Ник -> Email.
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v21';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';
const FALLBACK_ID = '000000';

const deepParseUser = (rawStr: string): any => {
  if (!rawStr) return null;
  try {
    const cleanStr = rawStr.replace(/^#/, '').replace(/^\?/, '');
    const params = new URLSearchParams(cleanStr);
    const userParam = params.get('user');
    if (userParam) return JSON.parse(decodeURIComponent(userParam));
    const webAppData = params.get('tgWebAppData');
    if (webAppData) return deepParseUser(decodeURIComponent(webAppData));
    for (const [_, value] of params.entries()) {
      if (value && (value.includes('{"id":') || value.includes('%7B%22id%22'))) {
        try { return JSON.parse(decodeURIComponent(value)); } catch (e) {}
      }
    }
  } catch (e) {}
  return null;
};

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    if (!userData) {
      const sources = [window.location.hash, window.location.search, tg?.initData].filter(Boolean);
      for (const s of sources) {
        userData = deepParseUser(s!);
        if (userData) break;
      }
    }

    const userId = userData?.id ? String(userData.id) : null;
    const username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : (userId ? `@id${userId}` : null);
    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : null;

    const finalId = userId || FALLBACK_ID;
    const finalNick = username || `@guest_${finalId}`;

    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId: finalId, username: finalNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        return { primaryId: c.username, tg_id: c.userId, username: c.username, displayName: c.fullName || c.username };
      }
    }

    return { primaryId: finalNick, tg_id: finalId, username: finalNick, displayName: fullName || finalNick };
  } catch (e) {
    return { primaryId: `@guest_${FALLBACK_ID}`, tg_id: FALLBACK_ID, username: `@guest_${FALLBACK_ID}`, displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  const webhook = ((): string => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.googleSheetWebhook?.includes('exec')) return parsed.googleSheetWebhook;
      }
    } catch (e) {}
    return DEFAULT_WEBHOOK;
  })();

  try {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // СТРОГИЙ МАППИНГ ПО ВАШЕМУ СКРИНШОТУ:
    // Поле 'name' -> Колонка B (Имя)
    // Поле 'email' -> Колонка C (Email)
    let finalName = payload.name || userInfo.displayName || nick;
    let finalEmail = payload.email || nick;

    // Если это обновление пути (Session), пишем название раздела в "Имя", а ник в "Email"
    if (payload.type === 'path_update' || payload.type === 'session_start') {
      finalName = payload.city || payload.type; 
      finalEmail = nick;
    }

    const cleanPayload = {
      ...payload,
      action: 'log', // Добавляем действие для скрипта
      name: finalName,
      email: finalEmail,
      city: payload.city || nick,
      country: nick,
      username: nick,
      _t: Date.now() // Анти-кэш
    };

    const query = new URLSearchParams();
    Object.keys(cleanPayload).forEach(key => {
      let v = String(cleanPayload[key]);
      if (!v || v === 'undefined' || v === 'null' || v === '---' || v === 'Unknown' || v === 'none') {
        v = nick;
      }
      query.append(key, v);
    });

    const url = `${webhook}${webhook.includes('?') ? '&' : '?'}${query.toString()}`;
    // Используем GET с no-cors - это 100% способ записи в Google Sheets
    await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-cache' });
  } catch (e) {}
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      orderId,
      dateStr: new Date().toLocaleString('ru-RU')
    });
    return { ...order, id: orderId };
  },
  startSession: async (forcedId?: string) => {
    const userInfo = getDetailedTgUser();
    const nick = forcedId || userInfo.username;
    const sid = `${nick.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
    await sendToScript({
      type: 'session_start',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: 'home', // Начальная точка
      sessionId: sid
    });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;
    await sendToScript({
      type: 'path_update',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: path, // Это пойдет в 'name' (Колонка B) благодаря логике в sendToScript
      sessionId: sid
    });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({
      type: 'order_update',
      orderId: id,
      paymentStatus: status === 'paid' ? 'success' : 'failed',
      dateStr: new Date().toLocaleString('ru-RU')
    });
  }
};
