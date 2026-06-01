const topics = [
  ['Cara membaca volume spike', 'Volume spike menunjukkan aktivitas transaksi melonjak dibanding rata-rata candle sebelumnya. Cari lonjakan yang disertai harga naik, bukan volume saja.'],
  ['Volume besar belum tentu harga naik', 'Volume tinggi bisa berasal dari distribusi. Jika volume melonjak tetapi harga stagnan atau turun, hindari entry terburu-buru.'],
  ['Support dan resistance', 'Support adalah area pantulan terdekat. Resistance adalah area jual terdekat. Gunakan support untuk batas risiko dan resistance untuk target bertahap.'],
  ['Menghindari beli di pucuk', 'Hindari candle 15 menit vertikal, RSI di atas 75, kenaikan 24 jam di atas 30%, atau harga lebih dari 12% di atas MA10.'],
  ['Checklist sebelum buy', 'Pastikan trend MA10 di atas MA30, RSI 50-70, relative volume di atas 2x, volume spike terkonfirmasi, dan stop loss sudah ditentukan.']
]

const Education = () => <div className="space-y-5"><div><div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Edukasi</div><h1 className="mt-2 text-2xl font-semibold">Checklist entry yang disiplin</h1></div><div className="grid gap-4 md:grid-cols-2">{topics.map(([title, body]) => <section key={title} className="rounded-md border border-white/10 bg-slate-900/60 p-5"><h2 className="font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></section>)}</div></div>

export default Education
