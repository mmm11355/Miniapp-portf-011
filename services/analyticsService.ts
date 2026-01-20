
/**
 * СУПЕРМОЗГ V24: ПРЯМОЙ КАНАЛ СВЯЗИ
 * Никаких сложных объектов. Только прямая отправка параметров строкой.
 * Гарантирует попадание в Колонку B (Имя) и Колонку C (Email).
 */

const CACHED_USER_KEY = 'olga_tg_final_v24';
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

    // СТРОГИЙ МАППИНГ ДЛЯ ВАШЕЙ ТАБЛИЦЫ
    const targetSheet = payload.sheet || 'Sessions';
    
    // По вашему скриншоту: Колонку B (Имя) заполняем разделом, Колонку C (Email) - ником
    let nameVal = payload.name || payload.city || payload.type || 'home';
    let emailVal = payload.email || nick;

    // Собираем параметры вручную
    const params = [
      `action=log`,
      `sheet=${encodeURIComponent(targetSheet)}`,
      `name=${encodeURIComponent(nameVal)}`,
      `email=${encodeURIComponent(emailVal)}`,
      `city=${encodeURIComponent(nameVal)}`,
      `country=${encodeURIComponent(nick)}`,
      `username=${encodeURIComponent(nick)}`,
      `type=${encodeURIComponent(payload.type || 'info')}`,
      `dateStr=${encodeURIComponent(new Date().toLocaleString('ru-RU'))}`,
      `_t=${Date.now()}`
    ];

    if (payload.orderId) params.push(`orderId=${encodeURIComponent(payload.orderId)}`);
    if (payload.product) params.push(`product=${encodeURIComponent(payload.product)}`);
    if (payload.price) params.push(`price=${encodeURIComponent(payload.price)}`);
    if (payload.sessionId) params.push(`sessionId=${encodeURIComponent(payload.sessionId)}`);

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.join('&')}`;

    // Используем максимально простой fetch
    await fetch(finalUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache'
    });

    console.log(`[OK] Logged to ${targetSheet}: ${nameVal}`);
  } catch (e) {
    console.error('[ERR]', e);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);
    await sendToScript({
      sheet: 'Orders',
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      orderId
    });
    return { ...order, id: orderId };
  },
  startSession: async (forcedId?: string) => {
    const userInfo = getDetailedTgUser();
    const nick = forcedId || userInfo.username;
    const sid = `sid_${Date.now()}`;
    await sendToScript({
      sheet: 'Sessions',
      type: 'session_start',
      city: 'home',
      sessionId: sid
    });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    await sendToScript({
      sheet: 'Sessions',
      type: 'path_update',
      city: path, 
      sessionId: sid || 'sid_none'
    });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({
      sheet: 'Orders',
      type: 'order_update',
      orderId: id,
      paymentStatus: status === 'paid' ? 'success' : 'failed'
    });
  }
};
