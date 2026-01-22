import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity, User, ShoppingCart } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbyMTb_XuWZGUM9xfKSBUlUNPbPsCjumWCEA3HN_ny_nwIYaELZeoYKMQnH3o3zNdD9B/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // ВАШ СКРИПТ записывает даты через toLocaleString('ru-RU')
  // Нам нужно очень точно их парсить
  const parseScriptDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    // Формат: "22.01.2026, 13:20:03"
    const parts = s.split(',');
    const dateParts = parts[0].split('.');
    if (dateParts.length === 3) {
      const isoStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}${parts[1] || ''}`;
      const d = new Date(isoStr).getTime();
      return isNaN(d) ? 0 : d;
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // ПЫТАЕМСЯ вызвать getStats (на случай, если в скрипте он есть, но вы его не скопировали)
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      
      // Если скрипт вернул данные в правильном формате
      if (data.sessions || data.leads) {
        setSessions(data.sessions || []);
        setLeads(data.leads || []);
      } else {
        console.warn("Скрипт не отдал данные. Проверьте экшен getStats в Google Script.");
      }
    } catch (e) {
      console.error("Ошибка запроса");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  const processed = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    // Мапим сессии под вашу структуру (Username во 2 колонке)
    const fSessions = sessions.filter(s => {
      const ts = parseScriptDate(s['Дата'] || s['timestamp'] || Object.values(s)[0]);
      return period === 'all' || ts >= limit;
    });

    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const name = s['Имя'] || s['username'] || 'Гость';
      nicks[name] = (nicks[name] || 0) + 1;
    });

    // Мапим заказы (Leads)
    const fLeads = leads.map(l => {
      const keys = Object.keys(l);
      // В вашем скрипте Дата - это 8-й параметр (индекс 7)
      const dateVal = l['Дата'] || l['timestamp'] || Object.values(l)[7];
      const ts = parseScriptDate(dateVal);
      const payStatus = String(l['PaymentStatus'] || Object.values(l)[9] || '').toLowerCase();
      
      const isPaid = payStatus === 'да' || payStatus.includes('оплат');
      const isFailed = payStatus.includes('отмен') || (!isPaid && ts > 0 && (now - ts) > 600000);

      return {
        ...l,
        ts,
        isPaid,
        isFailed,
        title: l['product'] || l['productTitle'] || Object.values(l)[0] || 'Заказ',
        price: l['price'] || Object.values(l)[1] || '0',
        user: l['email'] || l['customerEmail'] || Object.values(l)[3] || 'Гость'
      };
    }).filter(l => period === 'all' || l.ts >= limit);

    return {
      visits: fSessions.length,
      paid: fLeads.filter(l => l.isPaid).length,
      activity: Object.entries(nicks).sort((a,b) => b[1]-a[1]).slice(0, 10),
      displayLeads: fLeads.filter(l => activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed)
    };
  }, [sessions, leads, period, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans pb-10">
      {/* Header */}
      <div className="p-6 bg-white border-b flex justify-between items-center shadow-sm">
        <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Панель админа</h1>
        <button onClick={() => fetchData()}><RefreshCw size={18} className={loading ? 'animate-spin' : 'text-indigo-600'} /></button>
      </div>

      {/* Period Filter */}
      <div className="flex p-2 bg-white gap-1 mb-4 border-b">
        {['today', '7days', 'month', 'all'].map((p: any) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Все'}
          </button>
        ))}
      </div>

      {/* Главные цифры */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase">Визиты</p>
          <p className="text-3xl font-black">{processed.visits}</p>
        </div>
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">{processed.paid}</p>
        </div>
      </div>

      {/* Ники */}
      <div className="mx-4 bg-white rounded-[32px] p-5 border border-slate-100 mb-6 shadow-sm">
        <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Activity size={14} className="text-indigo-500"/> Активность (Ники)</h2>
        <div className="space-y-2">
          {processed.activity.map(([n, c]) => (
            <div key={n} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1">
              <span className="font-bold text-slate-600">{n}</span>
              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-black">{c}</span>
            </div>
          ))}
          {processed.activity.length === 0 && <p className="text-[10px] text-slate-300 italic">Нет визитов</p>}
        </div>
      </div>

      {/* Заказы */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase">Заказы ({processed.displayLeads.length})</h3>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1 text-[10px] font-black rounded-lg ${activeTab === 'active' ? 'bg-white text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1 text-[10px] font-black rounded-lg ${activeTab === 'archive' ? 'bg-white text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        <div className="space-y-3">
          {processed.displayLeads.map((l, i) => (
            <div key={i} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-black text-slate-800 truncate max-w-[200px]">{l.title}</span>
                <span className="text-sm font-black text-indigo-600">{l.price} ₽</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400">{l.user}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${l.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {l.isPaid ? 'OK' : 'Ждем'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
