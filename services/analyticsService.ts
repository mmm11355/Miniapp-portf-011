export const getDetailedTgUser = () => {
  const tg = (window as any).Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  if (user) {
    return {
      tg_id: String(user.id),
      username: user.username ? `@${user.username}` : `id${user.id}`,
      first_name: user.first_name || '',
      last_name: user.last_name || ''
    };
  }
  return { tg_id: '000000', username: 'guest', first_name: 'Guest', last_name: '' };
};

export const analyticsService = {
  async startSession() {
    const user = getDetailedTgUser();
    const sessionId = `SID_${Date.now()}`;
    
    const payload = {
      action: 'logSession',
      sheet: 'Sessions',
      sessionId: sessionId,
      tg_id: user.tg_id,
      username: user.username, // Тот самый захват ника
      path: 'home',
      timestamp: new Date().toLocaleString('ru-RU')
    };

    try {
      await fetch('https://script.google.com/macros/s/AKfycbzSknlqmsHRC1em9V4GedYF6awp6F_aexWtCWU0lxr-u1TVMdCJEeYr7dR1NHW6Z4wc/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
    return sessionId;
  },

  async updateSessionPath(sessionId: string, path: string) {
    if (!sessionId) return;
    const user = getDetailedTgUser();
    const payload = {
      action: 'logSession',
      sheet: 'Sessions',
      sessionId: sessionId,
      tg_id: user.tg_id,
      username: user.username,
      path: path,
      timestamp: new Date().toLocaleString('ru-RU')
    };
    try {
      await fetch('https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec', {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  },

  async logOrder(orderData: any) {
    const user = getDetailedTgUser();
    const orderId = `ORD_${Date.now()}`;
    const payload = {
      action: 'logOrder',
      sheet: 'Orders',
      ...orderData,
      id: orderId,
      tg_id: user.tg_id,
      username: user.username,
      timestamp: new Date().toLocaleString('ru-RU')
    };
    try {
      await fetch('https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec', {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload)
      });
    } catch (e) {}
    return { id: orderId };
  }
};
