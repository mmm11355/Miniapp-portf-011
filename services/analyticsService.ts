export const getDetailedTgUser = () => {
  const tg = (window as any).Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  if (user) {
    return {
      tg_id: String(user.id),
      username: user.username ? `@${user.username}` : `no_nick`,
      // Склеенная строка для полной надежности
      full_info: user.username ? `@${user.username} (${user.id})` : `ID: ${user.id}`
    };
  }
  return { tg_id: '000000', username: 'guest', full_info: 'Web_Guest' };
};

export const analyticsService = {
  async startSession() {
    const user = getDetailedTgUser();
    const sid = `SID_${Date.now()}`;
    
    // Формируем "жирный" пакет данных
    const payload = {
      action: 'logSession',
      sheet: 'Sessions',
      sessionId: sid,
      // Отправляем во всех возможных форматах, чтобы скрипт точно зацепил
      tg_id: user.tg_id,
      userId: user.tg_id, 
      username: user.username,
      tgUsername: user.username,
      full_user_info: user.full_info, // Новое поле со склейкой
      path: 'home',
      timestamp: new Date().toLocaleString('ru-RU')
    };

    this.rawSend(payload);
    return sid;
  },

  async updateSessionPath(sid: string, path: string) {
    if (!sid) return;
    const user = getDetailedTgUser();
    this.rawSend({
      action: 'logSession',
      sheet: 'Sessions',
      sessionId: sid,
      tg_id: user.tg_id,
      username: user.username,
      full_user_info: user.full_info,
      path: path,
      timestamp: new Date().toLocaleString('ru-RU')
    });
  },

  async logOrder(order: any) {
    const user = getDetailedTgUser();
    const oid = `ORD_${Date.now()}`;
    this.rawSend({
      action: 'logOrder',
      sheet: 'Orders',
      id: oid,
      tg_id: user.tg_id,
      username: user.username,
      full_user_info: user.full_info,
      productTitle: order.productTitle,
      price: order.price,
      customerEmail: order.customerEmail,
      timestamp: new Date().toLocaleString('ru-RU')
    });
    return { id: oid };
  },

  rawSend(data: any) {
    const url = 'https://script.google.com/macros/s/AKfycbzSknlqmsHRC1em9V4GedYF6awp6F_aexWtCWU0lxr-u1TVMdCJEeYr7dR1NHW6Z4wc/exec';
    
    // Используем самый стабильный метод отправки
    fetch(url, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(e => console.error("Script Error", e));
  }
};
