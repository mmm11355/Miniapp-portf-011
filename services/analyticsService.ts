
/**
 * СУПЕРМОЗГ V26: БЕЗОТКАЗНАЯ ПЕРЕДАЧА
 * Отправляем данные всеми возможными ключами одновременно.
 * Гарантируем заполнение колонок B, C, D и далее.
 */

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;
    
    // 1. Прямой доступ
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    // 2. Глубокий парсинг URL
    if (!userData) {
      const search = window.location.search || window.location.hash;
      const match = search.match(/user=({.*?})/);
      if (match) {
        try { userData = JSON.parse(decodeURIComponent(match[1])); } catch (e) {}
      }
    }

    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    const username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : (userData?.id ? `@id${userData.id}` : (localStorage.getItem('olga_cache_nick') || '@guest'));
    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    // Обновляем кэш
    if (userData?.id) {
      localStorage.setItem('olga_cache_id', String(userData.id));
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

    // МЕГА-ОБЪЕКТ СО ВСЕМИ ВОЗМОЖНЫМИ КЛЮЧАМИ
    // FIX: Removed duplicate keys 'Name' and 'Email' to resolve TypeScript object literal errors.
    const data: Record<string, any> = {
      // Имя (Обычно колонка B)
      name: currentPath,
      Name: currentPath,
      'Имя': currentPath,
      
      // Email / Ник (Обычно колонка C)
      email: userInfo.username,
      Email: userInfo.username,
      'Почта': userInfo.username,
      'username': userInfo.username,
      
      // ID (Обычно колонка D - судя по вашему скрину)
      id: userInfo.tg_id,
      ID: userInfo.tg_id,
      tg_id: userInfo.tg_id,
      userId: userInfo.tg_id,
      'ID пользователя': userInfo.tg_id,

      // Дополнительно
      action: 'log',
      sheet: targetSheet,
      type: payload.type || 'navigation',
      city: currentPath,
      sessionId: payload.sessionId || `SID_${Date.now()}`,
      dateStr: new Date().toLocaleString('ru-RU'),
      timestamp: Date.now(),
      _t: Date.now()
    };

    // Если это заказ
    if (payload.orderId) {
      data.orderId = payload.orderId;
      data.product = payload.product;
      data.price = payload.price;
      if (payload.name) data.customerName = payload.name;
      if (payload.email) data.customerEmail = payload.email;
    }

    // Сборка URL без ошибок
    const query = Object.entries(data)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${query}`;

    // Метод 1: Fetch с keepalive (самый современный)
    fetch(finalUrl, { 
      method: 'GET', 
      mode: 'no-cors', 
      cache: 'no-cache',
      keepalive: true 
    }).catch(() => {});

    // Метод 2: Image Beacon (дублируем для надежности)
    const beacon = new Image();
    beacon.src = finalUrl;

    console.log(`📡 [SENT] -> ${targetSheet} | Path: ${currentPath} | User: ${userInfo.username}`);
  } catch (err) {
    console.error('Critical log error:', err);
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
