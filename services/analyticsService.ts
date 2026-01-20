export const getDetailedTgUser = () => {
  const tg = (window as any).Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    return {
      userId: String(user.id),
      username: user.username ? `@${user.username}` : `id${user.id}`
    };
  }
  return { userId: 'guest', username: 'guest' };
};

export const analyticsService = {
  async startSession() {
    const user = getDetailedTgUser();
    this.rawSend({
      type: 'session', // СТРОГО как в скрипте
      userId: user.userId,
      username: user.username,
      utmSource: 'direct'
    });
    return `SID_${Date.now()}`;
  },

  async updateSessionPath(sid: string, path: string) {
    const user = getDetailedTgUser();
    this.rawSend({
      type: 'session',
      userId: user.userId,
      username: user.username,
      path: path
    });
  },

  async logOrder(order: any) {
    const user = getDetailedTgUser();
    const data = {
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      userId: user.userId,
      username: user.username
    };
    this.rawSend(data);
    return { id: `ORD_${Date.now()}` };
  },

  rawSend(data: any) {
    const url = 'https://script.google.com/macros/s/AKfycbwmGU6u-mzWG23jQxFpLpBcTo33oxFOVILHB11H1nUcaYYG8eJfIBo2OJfWIHGhSnEg/exec';
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(() => {});
  }
};
