
/**
 * СУПЕРМОЗГ V28: ПОЛНАЯ СИНХРОНИЗАЦИЯ СО СКРИПТОМ
 * Отправляет POST запрос с JSON, который ожидает ваш Google Script.
 */

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

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

    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      localStorage.setItem('olga_cache_nick', username);
      localStorage.setItem('olga_cache_name', fullName);
    }

    return { 
      tg_id: userId, 
      username: username, 
      displayName: fullName 
    };
  } catch (e) {
    return { tg_id: '000000', username: '@guest', displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  try {
    const webhook = ((): string => {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.googleSheetWebhook?.includes('exec')) return parsed.googleSheetWebhook;
        } catch (e) {}
      }
      return DEFAULT_WEBHOOK;
    })();

    const userInfo = getDetailedTgUser();
    
    // Формируем объект строго под ваш doPost в Google Script
    const data: any = {
      ...payload,
      tgUsername: userInfo.username,
      dateStr: new Date().toLocaleString('ru-RU'),
      // Чтобы ID попал в колонку D листа Sessions, передаем его как utmSource
      utmSource: userInfo.username || 'direct'
    };

    // Отправка через POST (как требует ваш скрипт для логирования)
    // Используем fetch с mode: 'no-cors', так как Google Script не возвращает CORS заголовки на POST
    fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain', // Важно для Google Script doPost
      },
      body: JSON.stringify(data)
    }).catch(e => console.error('Silent post error:', e));

    console.log(`🚀 [POST SENT] -> ${data.type} | User: ${userInfo.username}`);
  } catch (err) {
    console.error('Critical send error:', err);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const orderId = `ORD${Date.now()}`;
    const userInfo = getDetailedTgUser();
    
    // Поля строго под sheetLeads.appendRow в вашем скрипте
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone || '---',
      orderId: orderId,
      paymentStatus: 'pending',
      agreedToMarketing: order.agreedToMarketing ? 'Да' : 'Нет',
      tgUsername: userInfo.username,
      productId: order.productId || 'none'
    });
    
    return { ...order, id: orderId };
  },
  
  startSession: async (forcedId?: string) => {
    const sid = `SID_${Date.now()}`;
    // Поля строго под sheetSessions.appendRow в вашем скрипте
    // Тип 'session_start' обязателен для вашего doPost
    await sendToScript({
      type: 'session_start',
      city: 'home',
      country: 'RU',
      sessionId: sid
    });
    return sid;
  },
  
  updateSessionPath: async (sid: string, path: string) => {
    // Поля строго под sheetSessions.appendRow в вашем скрипте
    // Тип 'path_update' обязателен для вашего doPost
    await sendToScript({
      type: 'path_update',
      city: path,
      country: 'RU',
      sessionId: sid
    });
  },

  updateOrderStatus: async (id: string, status: string) => {
    // Этот метод в вашем скрипте обрабатывается через параметры order_id в doPost (A)
    // Но мы можем отправить и через JSON для общности
    await sendToScript({
      type: 'status_update',
      orderId: id,
      paymentStatus: status
    });
  }
};
