/**
 * УЛУЧШЕННЫЙ АНАЛИТИК ДЛЯ ОЛЬГИ (V41)
 * Совмещает кэширование "СУПЕРМОЗГА" и корректную отправку в таблицу.
 */

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzSknlqmsHRC1em9V4GedYF6awp6F_aexWtCWU0lxr-u1TVMdCJEeYr7dR1NHW6Z4wc/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData = tg?.initDataUnsafe?.user;

    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    
    let username = '@guest';
    if (userData?.username) {
      username = `@${userData.username.replace(/^@/, '')}`;
    } else if (userData?.id) {
      // Если ника нет — создаем из ID
      username = `@id${userData.id}`;
    } else {
      const cached = localStorage.getItem('olga_cache_nick');
      if (cached && cached !== '@guest') username = cached;
    }

    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    // Сохраняем для надежности
    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      localStorage.setItem('olga_cache_nick', username);
      localStorage.setItem('olga_cache_name', fullName);
    }

    return { tg_id: userId, username: username, displayName: fullName };
  } catch (e) {
    return { tg_id: '000000', username: '@guest', displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  try {
    const freshUser = getDetailedTgUser();
    
    // Формируем объект данных точно под столбцы таблицы
    const data: any = {
      action: payload.type === 'order' ? 'logOrder' : 'logSession',
      sheet: payload.type === 'order' ? 'Orders' : 'Sessions',
      timestamp: new Date().toLocaleString('ru-RU'),
      date: new Date().toLocaleString('ru-RU'),
      path: payload.path || 'home',
      sessionId: payload.sessionId || 'SID_NONE',
      // Отправляем оба варианта имени поля, чтобы скрипт точно поймал
      tg_id: freshUser.tg_id,
      userId: freshUser.tg_id,
      username: freshUser.username,
      tgUsername: freshUser.username,
      name: freshUser.displayName,
      utm_source: new URLSearchParams(window.location.search).get('utm_source') || 'direct'
    };

    // Если это заказ, добавляем детали заказа
    if (payload.type === 'order') {
      data.productTitle = payload.product;
      data.price = payload.price;
      data.customerEmail = payload.email;
      data.customerName = payload.name;
    }

    const webhook = DEFAULT_WEBHOOK; // Используем твой основной вебхук

    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error('Data error:', err);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const orderId = `ORD${Date.now()}`;
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      email: order.customerEmail,
      name: order.customerName,
      sessionId: orderId
    });
    return { ...order, id: orderId };
  },
  startSession: async (userInfo?: any) => {
    const sid = `SID_${Date.now()}`;
    // Используем userInfo если передано, иначе fresh
    await sendToScript({ type: 'session_start', sessionId: sid, path: 'home' });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    if (!sid) return;
    await sendToScript({ type: 'path_update', sessionId: sid, path: path });
  }
};
