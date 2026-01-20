
/**
 * СУПЕРМОЗГ V27: СПАСАТЕЛЬНАЯ ВЕРСИЯ
 * Использует navigator.sendBeacon - самый надежный способ отправки аналитики.
 * Гарантирует доставку даже при закрытии приложения.
 */

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;
    
    // 1. Из SDK
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    // 2. Из URL (если Desktop)
    if (!userData) {
      const urlPart = window.location.hash || window.location.search;
      const match = urlPart.match(/user=({.*?})/);
      if (match) {
        try { userData = JSON.parse(decodeURIComponent(match[1])); } catch (e) {}
      }
    }

    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    const username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : (userData?.id ? `@id${userData.id}` : (localStorage.getItem('olga_cache_nick') || '@guest'));
    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    // Кэшируем
    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      localStorage.setItem('olga_cache_nick', username);
      localStorage.setItem('olga_cache_name', fullName);
    }

    return { 
      primaryId: username, 
      tg_id: userId, 
      username: username, 
      displayName: fullName 
    };
  } catch (e) {
    return { primaryId: '@guest', tg_id: '000000', username: '@guest', displayName: 'User' };
  }
};

const sendToScript = (payload: any) => {
  try {
    const webhook = ((): string => {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.googleSheetWebhook?.includes('exec')) return parsed.googleSheetWebhook;
      }
      return DEFAULT_WEBHOOK;
    })();

    const userInfo = getDetailedTgUser();
    const targetSheet = payload.sheet || 'Sessions';
    const currentPath = payload.city || payload.name || 'home';

    // Формируем параметры (ОБЯЗАТЕЛЬНО TitleCase + lowercase для гарантии)
    const params = new URLSearchParams();
    params.append('action', 'log');
    params.append('sheet', targetSheet);
    
    // Колонки B и C (самые важные)
    params.append('name', currentPath);
    params.append('Name', currentPath);
    params.append('Имя', currentPath);
    
    params.append('email', userInfo.username);
    params.append('Email', userInfo.username);
    params.append('Почта', userInfo.username);
    
    // Колонка D (ID)
    params.append('id', userInfo.tg_id);
    params.append('ID', userInfo.tg_id);
    params.append('tg_id', userInfo.tg_id);
    
    // Остальное
    params.append('type', payload.type || 'nav');
    params.append('city', currentPath);
    params.append('sessionId', payload.sessionId || `SID_${Date.now()}`);
    params.append('dateStr', new Date().toLocaleString('ru-RU'));
    params.append('_t', Date.now().toString());

    if (payload.orderId) {
      params.append('orderId', payload.orderId);
      params.append('product', payload.product || '');
      params.append('price', String(payload.price || '0'));
    }

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.toString()}`;

    // МЕТОД 1: Beacon API (рекомендуется для аналитики)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(finalUrl);
    }

    // МЕТОД 2: Image Ping (пробивает всё)
    const img = new Image();
    img.src = finalUrl;

    // МЕТОД 3: Fetch (для надежности на старых iOS)
    fetch(finalUrl, { mode: 'no-cors', keepalive: true }).catch(() => {});

    console.log(`✅ [FIRE] -> ${targetSheet} | ${currentPath} | ${userInfo.username}`);
  } catch (err) {
    console.error('Log error:', err);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const orderId = `ORD${Date.now()}`;
    sendToScript({
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
    const sid = `SID_${Date.now()}`;
    sendToScript({
      sheet: 'Sessions',
      type: 'start',
      city: 'home',
      sessionId: sid
    });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    sendToScript({
      sheet: 'Sessions',
      type: 'path',
      city: path, 
      sessionId: sid
    });
  },
  updateOrderStatus: async (id: string, status: string) => {
    sendToScript({
      sheet: 'Orders',
      type: 'status_update',
      orderId: id,
      paymentStatus: status
    });
  }
};
