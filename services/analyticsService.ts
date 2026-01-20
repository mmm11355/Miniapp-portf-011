
/**
 * СУПЕРМОЗГ V19: ФИНАЛЬНЫЙ ЗАХВАТ ДАННЫХ
 * Исправлен парсинг для Desktop и маппинг для таблицы.
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v19';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';
const FALLBACK_ID = '000000';

/**
 * Глубокий парсинг строки на наличие объекта user
 */
const deepParseUser = (rawStr: string): any => {
  if (!rawStr) return null;
  try {
    const cleanStr = rawStr.replace(/^#/, '').replace(/^\?/, '');
    const params = new URLSearchParams(cleanStr);
    
    // Проверяем прямое наличие user
    const userParam = params.get('user');
    if (userParam) return JSON.parse(decodeURIComponent(userParam));
    
    // Проверяем вложенность в tgWebAppData (стандарт для Desktop)
    const webAppData = params.get('tgWebAppData');
    if (webAppData) return deepParseUser(decodeURIComponent(webAppData));

    // Пробуем найти JSON структуру в любом параметре
    for (const [_, value] of params.entries()) {
      if (value && (value.includes('{"id":') || value.includes('%7B%22id%22'))) {
        try {
          return JSON.parse(decodeURIComponent(value));
        } catch (e) {}
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

    // 1. Прямая попытка через официальный SDK
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    // 2. Если пусто (часто на PC), парсим все URL источники
    if (!userData) {
      const sources = [window.location.hash, window.location.search, tg?.initData].filter(Boolean);
      for (const s of sources) {
        userData = deepParseUser(s!);
        if (userData) break;
      }
    }

    // 3. Формируем идентификаторы
    const userId = userData?.id ? String(userData.id) : null;
    const username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : (userId ? `@id${userId}` : null);
    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : null;

    const finalId = userId || FALLBACK_ID;
    const finalNick = username || `@guest_${finalId}`;

    // 4. Кэширование для стабильности при перезагрузках
    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId: finalId, username: finalNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        return { primaryId: c.username, tg_id: c.userId, username: c.username, displayName: c.fullName || c.username };
      }
    }

    return {
      primaryId: finalNick,
      tg_id: finalId,
      username: finalNick,
      displayName: fullName || finalNick
    };
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
    // Свежий захват пользователя перед каждой отправкой
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // МАППИНГ ДЛЯ ТАБЛИЦЫ:
    // city (Col B "Имя") -> Ник
    // country (Col C "Email") -> Ник
    const cleanPayload = {
      ...payload,
      city: (payload.type === 'path_update') ? payload.city : (payload.city && !['---', 'Unknown', 'none'].includes(payload.city)) ? payload.city : nick,
      country: (payload.country && !['---', 'Unknown', 'none'].includes(payload.country)) ? payload.country : nick,
      name: payload.name || userInfo.displayName,
      email: payload.email || nick,
      username: nick,
      tgUsername: nick
    };

    const query = new URLSearchParams();
    Object.keys(cleanPayload).forEach(key => {
      let v = String(cleanPayload[key]);
      // Жесткая замена мусора на Ник
      if (!v || v === 'undefined' || v === 'null' || v === '---' || v === 'Unknown' || v === 'none') {
        v = nick;
      }
      query.append(key, v);
    });

    const url = `${webhook}${webhook.includes('?') ? '&' : '?'}${query.toString()}`;
    await fetch(url, { method: 'POST', mode: 'no-cors', cache: 'no-cache' });
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
      city: nick, 
      country: nick,
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
      city: path, 
      country: nick,
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
