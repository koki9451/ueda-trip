// 出所: Claude生成（上田・真田観光アプリのスポットデータ）
// 調査日 2026-11-14 ／ 旅行日 2026-11-22(日)〜23(月・祝) を前提に営業情報を確認。
// 詳細と出典は 02_work/ueda-trip-app/research/ の3ファイル。
// 写真はウィキメディア・コモンズ（作者・ライセンスを表示）。動画はYouTube。

window.TRIP = {
  title: '上田・真田 旅のしおり',
  days: [
    { date: '2026-11-22', label: '1日目', wd: '日' },
    { date: '2026-11-23', label: '2日目', wd: '月・祝' }
  ],
  sunset: '16:33', // 11月下旬の上田周辺の日没（近隣地点の値からの目安）
  center: { lat: 36.405, lng: 138.26 },
  bases: [
    { id: 'ueda-st', name: '上田駅', lat: 36.39698, lng: 138.24947, gq: '上田駅' }
  ]
};

window.AREAS = {
  shigai: { name: '上田市街', note: '駅から徒歩10〜15分圏。循環バスは日曜・祝日運休のため徒歩で回る。' },
  sanada: { name: '真田の郷', note: '上田駅の北東、車で20〜30分。バスは日祝1日10本。車・観光タクシー・バス＋電動自転車のいずれか。' },
  bessho: { name: '別所・塩田平', note: '別所線で約28分（約1時間に1本）。寺社は16時に閉まる。' }
};

window.CATS = {
  castle: { name: '城・史跡', color: '#a4262c', mark: '城' },
  temple: { name: '寺社', color: '#2f6f4f', mark: '社' },
  museum: { name: '資料館', color: '#2b5c9e', mark: '館' },
  town:   { name: '街歩き', color: '#8a5a1c', mark: '街' },
  onsen:  { name: '温泉', color: '#b0478a', mark: '湯' },
  food:   { name: '食事', color: '#c2570c', mark: '食' },
  base:   { name: '拠点', color: '#5a5f66', mark: '拠' }
};

window.SPOTS = [
  // ───────── 上田市街 ─────────
  {
    id: 'ueda-castle', name: '上田城跡公園', yomi: 'うえだじょうせきこうえん',
    sub: '櫓・櫓門／眞田神社／真田井戸',
    area: 'shigai', cat: 'castle', lat: 36.40397, lng: 138.24425, gq: '上田城跡公園',
    intro: '天正11年(1583)に真田昌幸が築いた平城の跡。徳川軍を二度退けた城で、櫓3棟と復元櫓門、堀・土塁が残る。',
    points: [
      '東虎口櫓門と南櫓・北櫓が並ぶ城の正面（内部も見学できる）',
      '眞田神社と境内奥の真田井戸、真田信繁の大兜',
      '本丸の堀・土塁と尼ヶ淵の崖、けやき並木の紅葉'
    ],
    sanada: { type: '史実', text: '真田昌幸が1583年に築城。1585年と1600年の上田合戦で徳川軍を退けた。関ヶ原後に破却され、現在の櫓は仙石氏の復興以降のもの。真田井戸の抜け穴は伝承。' },
    stay: 75, outdoor: true,
    last: '16:30', lastLabel: '櫓の最終入館',
    hours: '公園は終日・無料。櫓は9:00〜17:00（入館16:30まで）。11/22・23とも開館。',
    fee: '櫓 一般300円（博物館とのセット券500円）',
    parking: '北駐車場216台・南駐車場83台。1時間無料、以後1時間100円、当日上限500円',
    transit: { level: 'good', text: '上田駅から徒歩12分。循環バスは日曜・祝日運休。' },
    caution: ['櫓内は傘の持ち込み・飲食不可', '南駐車場側（尼ヶ淵）からは階段。北駐車場側は高低差なし'],
    check: ['櫓の11月下旬の開館は、観光協会ページ（11月中旬から冬期休館）と博物館カレンダー（11/30まで開館）で食い違い。当日朝に博物館へ電話確認を'],
    tel: '0268-22-1274', telLabel: '上田市立博物館',
    official: 'https://www.city.ueda.nagano.jp/site/uedajo/',
    photo: { file: 'Ueda_Castle_South_Turret.jpg', author: 'Suikotei', license: 'CC BY-SA 4.0' },
    video: { id: 'QQPiJncDSXw', title: '上田のお宝発見「上田城 西櫓・北櫓・南櫓」', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'ueda-museum', name: '上田市立博物館', yomi: 'うえだしりつはくぶつかん',
    area: 'shigai', cat: 'museum', lat: 36.40374, lng: 138.24650, gq: '上田市立博物館',
    intro: '上田城跡公園内の歴史博物館。本館で歴代上田藩主の資料、別館で真田氏関連資料を展示する。',
    points: [
      '別館2階の真田氏関連資料',
      '本館1階の歴代上田藩主（真田・仙石・松平）の甲冑',
      '櫓とのセット券（500円）で城とまとめて見学できる'
    ],
    sanada: { type: '史実', text: '真田氏・仙石氏・松平氏の歴代上田城主の甲冑などを収蔵・展示。別館は真田氏関連資料が中心。' },
    stay: 50, outdoor: false,
    open: '09:00', last: '16:30', close: '17:00',
    hours: '9:00〜17:00（入館16:30まで）。水曜・祝日の翌日休館。11/22・23とも開館。',
    fee: '一般300円／学生200円／小中学生100円',
    parking: '専用なし。上田城跡公園の駐車場を利用',
    transit: { level: 'good', text: '上田駅から徒歩約12分（上田城跡公園内）。' },
    caution: ['館内は飲食不可、傘の持ち込み不可', '企画展は11/10で終了。旅行日は常設展のみの見込み'],
    check: [],
    tel: '0268-22-1274',
    official: 'https://museum.umic.jp/hakubutsukan/',
    photo: { file: 'Ueda_City_Museum_2022-12.jpg', author: 'Qurren', license: 'CC BY-SA 4.0' },
    video: null
  },
  {
    id: 'taiheiki', name: '池波正太郎真田太平記館', yomi: 'いけなみしょうたろう さなだたいへいきかん',
    area: 'shigai', cat: 'museum', lat: 36.40311, lng: 138.25353, gq: '池波正太郎真田太平記館',
    intro: '作家・池波正太郎と小説『真田太平記』を紹介する文学館。取材ノートや挿絵原画、映像で作品世界をたどれる。',
    points: [
      '真田太平記コーナーの年表・取材ノート・地形模型',
      '大坂の陣のプロジェクションマッピングとジオラマ',
      '蔵のギャラリー（挿絵原画17点）とシアター'
    ],
    sanada: { type: '小説', text: '真田一族を描いた池波正太郎の小説『真田太平記』の資料館。史跡ではなく、作品と作家の取材の足跡を紹介する施設。' },
    stay: 50, outdoor: false,
    open: '10:00', last: '17:30', close: '18:00',
    hours: '10:00〜18:00（入館17:30まで）。11/22・23とも開館。',
    fee: '一般400円／高・大学生260円／小・中学生130円',
    parking: 'なし（近隣の有料駐車場）',
    transit: { level: 'good', text: '上田駅から徒歩約10分。' },
    caution: ['旅行日は企画展なし。常設展とシアターを観覧'],
    check: [],
    official: 'https://www.city.ueda.nagano.jp/site/ikenami/',
    photo: { file: 'Ikenami_Shotaro_Sanada_Taiheiki_Kan.JPG', author: 'Abasaa', license: 'パブリックドメイン' },
    video: { id: 'zS2GXRJJiCM', title: '池波正太郎真田太平記館', channel: '宇宙のすべての知識 プリンシピア', official: false }
  },
  {
    id: 'yanagimachi', name: '柳町（北国街道）', yomi: 'やなぎまち',
    area: 'shigai', cat: 'town', lat: 36.40573, lng: 138.25310, gq: '柳町 北国街道 上田市',
    intro: '旧北国街道沿いに白壁・格子戸・うだつの町家が約300m続く通り。酒蔵、そば、パン、味噌の店が並ぶ。',
    points: [
      '白い土壁・格子戸・うだつが並ぶ石畳の町並み',
      '寛文5年(1665)創業の岡崎酒造と武田味噌の直売店',
      '保命水そばの「おお西」の発芽そば、ルヴァンのパン'
    ],
    sanada: { type: '城下町', text: '上田城の城下町として戦国期に生まれ、江戸時代は北国街道上田宿として栄えた。真田氏の直接の史跡ではなく、町並みは主に江戸期以降の姿。' },
    stay: 45, outdoor: true,
    hours: '通りは終日歩ける。店ごとに営業時間が異なる（午後早めに閉まる店あり）。',
    fee: '散策無料',
    parking: 'タイムズ上田柳町（30分100円、24時間最大500円）',
    transit: { level: 'good', text: '上田駅お城口から徒歩約15分。上田城跡北駐車場から徒歩約7分。' },
    caution: ['石畳', 'そば店は14時ごろまで'],
    check: [],
    official: 'https://yanagimachi-ueda.jp/',
    photo: { file: 'Yanagimachi_(Ueda,_Nagano)_20251130.jpg', author: 'Suikotei', license: 'CC BY 4.0' },
    video: { id: 'cVcpcg9DZWo', title: '【北国街道 柳町】', channel: 'Discover NAGANO', official: false }
  },

  // ───────── 真田の郷 ─────────
  {
    id: 'sanada-museum', name: '真田氏歴史館・御屋敷公園', yomi: 'さなだしれきしかん',
    sub: '真田氏館跡／皇太神社',
    area: 'sanada', cat: 'museum', lat: 36.43155, lng: 138.31882, gq: '真田氏歴史館',
    intro: '真田氏の居館跡（御屋敷公園）に隣接する資料館。古文書や武具で真田一族の歩みを年代順にたどれる。',
    points: [
      '古文書・武具などを年代順に並べた展示',
      '館跡を囲む土塁（東側は高さ4〜5m）と枡形',
      '館跡内の皇太神社と「厩屋跡」の低地'
    ],
    sanada: { type: '史実', text: '上田城築城以前の真田氏の居館跡で県史跡（室町後期）。真田氏の館で遺構が残るのはここだけとされる。' },
    stay: 60, outdoor: false,
    open: '09:00', close: '16:00',
    hours: '9:00〜16:00。火曜休館。11/22・23とも開館。最終入館時刻は未確認。',
    fee: '一般250円／学生160円／小中学生100円',
    parking: '台数は未確認',
    transit: { level: 'car', text: '菅平高原線「幸村の郷夢工房前」下車（上田駅から約24分）→ 上り坂2.4km。夢工房の無料電動自転車で約15分、徒歩なら35〜40分。' },
    caution: ['16時に閉まるので、真田の郷では最初に回るのがおすすめ'],
    check: ['最終入館時刻と駐車場は未確認'],
    tel: '0268-72-4344',
    official: 'https://www.city.ueda.nagano.jp/soshiki/ssangyo/2758.html',
    photo: { file: 'History_Museum_of_the_Sanada_Clan_1.jpg', author: 'Qurren', license: 'CC BY-SA 4.0' },
    video: { id: 'b3VZVFsEoUM', title: '上田のお宝発見『真田氏館跡（御屋敷公園）』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'honjo', name: '真田氏本城跡', yomi: 'さなだしほんじょうあと',
    area: 'sanada', cat: 'castle', lat: 36.44181, lng: 138.32272, gq: '真田氏本城跡',
    intro: '真田の郷を見下ろす尾根上の山城跡。上田城以前の真田氏の本拠とされ、郷と上州道を一望できる。',
    points: [
      '尾根先端から見渡す真田の郷と上州道',
      '町内の他の城跡より広い郭の規模',
      '尾根づたいに水を引いた「水の手」の伝え'
    ],
    sanada: { type: '史実（一部未確定）', text: '上田市指定史跡。規模と位置から「真田氏の本城」とされるが、築城者・時期は確定していない。別名は真田山城・松尾新城。' },
    stay: 30, outdoor: true,
    hours: '屋外・常時見学可。',
    fee: '無料',
    parking: '乗用車の台数は未確認（バス駐車場あり）',
    transit: { level: 'car', text: '最寄りバス停の公式記載なし。歴史館から1.8km（急坂）、長谷寺から3.0km。' },
    caution: ['尾根上の土道。歩きやすい靴で', '日没後は危険。明るいうちに'],
    check: ['駐車台数・トイレは未確認'],
    official: 'https://ueda-kanko.or.jp/spot/sanadashihonjo/',
    photo: { file: 'Sanadahonjyo.jpg', author: '作者名の記載なし', license: 'パブリックドメイン' },
    video: { id: 'Cc5v1D46Cu0', title: '上田のお宝発見『真田氏本城跡・天白城跡』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'chokokuji', name: '長谷寺', yomi: 'ちょうこくじ',
    sub: '真田幸綱夫妻・昌幸の墓',
    area: 'sanada', cat: 'temple', lat: 36.44618, lng: 138.33564, gq: '長谷寺 上田市真田町',
    intro: '真田幸綱（幸隆）が開いた真田氏の菩提寺。本堂裏に幸綱夫妻と昌幸の墓が並ぶ静かな山寺。',
    points: [
      '本堂裏の真田幸綱夫妻・昌幸の墓所',
      '六文銭を刻んだアーチ型の石門',
      '参道の枡形と境内の桜の老木、鐘楼'
    ],
    sanada: { type: '史実', text: '天文16年(1547)幸綱が菩提寺として建立、昌幸の代に諸堂を整備。1600年の兵火で焼失。信之の松代移封後は長國寺の末寺となった（寺伝を含む）。' },
    stay: 30, outdoor: true,
    close: '17:00',
    hours: '本堂5:00〜17:00（変更あり）。境内・墓所は自由参拝。',
    fee: '拝観料の定めなし（御朱印は浄財箱へ）',
    parking: '40台',
    transit: { level: 'few', text: '菅平高原線「真田」下車（上田駅から約30分）、急な坂道を徒歩20分。' },
    caution: ['雪が降ると墓所にお参りできない（寺の案内）', '暗くなると真っ暗。明るいうちに'],
    check: [],
    tel: '0268-72-2040',
    official: 'http://www.chouk.or.jp/',
    photo: null,
    video: { id: 'KyG3B1nawuE', title: '上田のお宝発見『長谷寺〜真田幸隆夫妻・昌幸の墓〜』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'yamaga', name: '山家神社', yomi: 'やまがじんじゃ',
    area: 'sanada', cat: 'temple', lat: 36.45075, lng: 138.33099, gq: '山家神社 上田市',
    intro: '真田郷の産土神をまつる古社。四阿山に奥宮を置き、真田氏代々と歴代上田城主の崇敬を受けた。',
    points: [
      '拝殿と鳥居、境内の社叢',
      '境内にある真田神社',
      '白山大権現などの限定御朱印'
    ],
    sanada: { type: '史実・社伝', text: '真田氏代々が崇敬し奥宮・本宮の営繕を行った。1600年の兵火で全焼し、翌年真田信幸が再建したと社伝にある。真田信綱・昌幸の文書が社宝。' },
    stay: 20, outdoor: true,
    close: '17:00',
    hours: '参拝自由。授与所は9:00〜17:00とみられる（正確な時間は未確認）。',
    fee: '無料',
    parking: '乗用車の台数は未確認',
    transit: { level: 'few', text: '菅平高原線「真田」下車（上田駅から約28〜30分）。長谷寺まで0.9km。' },
    caution: [],
    check: ['授与所の時間は未確認'],
    tel: '0268-72-5700',
    official: 'http://www.yamaga.or.jp/',
    photo: { file: 'Yamaga_Shrine_in_Ueda_city.jpg', author: 'ブルーノ・プラス', license: 'CC BY 4.0' },
    video: { id: 'Tbw8qV2A_k0', title: '上田のお宝発見『山家神社〜社叢〜』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'shinkoji', name: '信綱寺', yomi: 'しんこうじ',
    sub: '真田信綱夫妻の墓',
    area: 'sanada', cat: 'temple', lat: 36.44867, lng: 138.30922, gq: '信綱寺 上田市',
    intro: '昌幸の兄・真田信綱の菩提寺。黒門から参道を上がった先に信綱夫妻の墓がある。',
    points: [
      '真田信綱夫妻の墓',
      '参道入口の黒門',
      '徒歩約1分の古城緑地広場'
    ],
    sanada: { type: '史実（一部伝承）', text: '信綱が現在地に移して打越寺と称し、のち信綱寺となった。信綱の首を包んだという血染めの陣羽織が伝わる（伝承）。' },
    stay: 30, outdoor: true,
    hours: '境内自由（公式の時間記載なし）。',
    fee: '無料',
    parking: '25台（旅行サイトの情報）',
    transit: { level: 'few', text: '菅平高原線「幸村の郷夢工房前」下車（上田駅から約24分）、0.7km・徒歩10〜15分。' },
    caution: ['黒門から墓所まで坂の参道'],
    check: ['拝観時間の公式情報は未確認'],
    official: 'https://ueda-kanko.or.jp/spot/shinkoji/',
    photo: null,
    video: { id: 'NNc5UUJRZUs', title: '上田のお宝発見『信綱寺〜真田信綱の墓〜』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'yumekobo', name: 'ゆきむら夢工房', yomi: 'ゆきむらゆめこうぼう',
    sub: '観光案内・そば処・無料の電動自転車',
    area: 'sanada', cat: 'base', lat: 36.44061, lng: 138.30756, gq: 'ゆきむら夢工房',
    intro: '真田の郷めぐりの拠点。観光案内と土産、週末のそば処、無料の電動アシスト自転車がある。',
    points: [
      '無料の電動アシスト自転車（10台・先着・予約不可）',
      '土日祝のそば処（11月から新そば。なくなり次第終了）',
      '観光案内と地場産品の売店'
    ],
    sanada: { type: '拠点', text: '史跡ではなく観光拠点。公共交通で真田の郷を回るときの出発点になる。' },
    stay: 25, outdoor: false,
    open: '08:30', close: '17:15',
    hours: '8:30〜17:15。11/22・23とも開館。そば処は土日祝11時から。',
    fee: '入館無料',
    parking: '台数は未確認',
    transit: { level: 'few', text: '菅平高原線「幸村の郷夢工房前」下車徒歩1分（上田駅から約23分）。' },
    caution: ['電動自転車は9:00〜16:00（受付15時まで）。写真付き身分証が必要'],
    check: ['電動自転車の11月下旬の貸出は電話で確認を'],
    tel: '0268-72-2204',
    official: 'https://www.city.ueda.nagano.jp/soshiki/ssangyo/2828.html',
    photo: null, video: null
  },

  // ───────── 別所・塩田平 ─────────
  {
    id: 'ikushima', name: '生島足島神社', yomi: 'いくしまたるしまじんじゃ',
    area: 'bessho', cat: 'temple', lat: 36.36046, lng: 138.21806, gq: '生島足島神社',
    intro: '延喜式に載る信濃屈指の古社。池に囲まれた神島に本社が建ち、武田信玄の願文や真田昌幸朱印状など古文書94通（重文）を所蔵。',
    points: [
      '池に浮かぶ神島の御本社',
      '歌舞伎舞台（県宝）と、武田家臣団の起請文の複製展示',
      '重文「生島足島神社文書」94通（真田昌幸朱印状を含む）'
    ],
    sanada: { type: '史実', text: '戦国時代以後、真田昌幸・信之らが神領を寄進し社殿を修築した。所蔵の真田昌幸朱印状は、武田家滅亡後に真田家が上田領主として独立していたことが分かる史料。' },
    stay: 40, outdoor: true,
    hours: '境内は随時・無料。御祈願9:00〜16:00。11/23は新穀感謝祭（新嘗祭）。',
    fee: '無料',
    parking: '無料・約80台',
    transit: { level: 'good', text: '別所線「下之郷駅」すぐ（上田駅から約15分・380円）。約1時間に1本。' },
    caution: ['七五三の時期で混雑の可能性'],
    check: ['起請文展示の公開状況は未確認。事前に電話確認を'],
    official: 'https://www.ikushimatarushima.com/',
    photo: { file: 'Ikushimatarushima-jinja_shinkyo.JPG', author: 'Saigen Jiro', license: 'CC0' },
    video: { id: 'C8XcMsBVB5Y', title: '上田のお宝発見『生島足島神社文書』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'ishiyu', name: '別所温泉（外湯 石湯）', yomi: 'べっしょおんせん・いしゆ',
    sub: '「真田幸村の隠し湯」',
    area: 'bessho', cat: 'onsen', lat: 36.34978, lng: 138.15487, gq: '石湯 別所温泉',
    intro: '信州最古とされる温泉地。外湯「石湯」は「真田幸村隠しの湯」として知られ、湯めぐりと寺社めぐりが徒歩で楽しめる。',
    points: [
      '石湯の地下の浴室と、天然岩をそのまま使った浴槽',
      '入口の「真田幸村公隠しの湯」標石',
      '外湯3か所（石湯・大師湯・大湯）と無料の足湯'
    ],
    sanada: { type: '伝承・小説', text: '「真田氏の隠し湯だったといわれている」（伝承）。「幸村の隠し湯」は池波正太郎『真田太平記』に登場することに由来。史料での裏づけは確認できていない。' },
    stay: 75, outdoor: false,
    open: '06:30', close: '21:30',
    hours: '石湯 6:30〜21:30（火曜休）、300円。11/22・23とも営業。',
    fee: '300円',
    parking: '近隣のタイムズ別所温泉観音下（34台、日中60分500円）',
    transit: { level: 'few', text: '別所線の終点「別所温泉駅」（上田駅から約28分・590円、約1時間に1本）。駅から上り坂を徒歩約15分。' },
    caution: ['温泉街は坂が多い', 'ロッカーは100円リターン式。石けん類の備え付けは未確認'],
    check: [],
    official: 'https://www.bessho-spa.jp/sight/spa.html',
    photo: { file: 'Ishi-yu_Bessho_Hotspring.JPG', author: 'NY066', license: 'CC BY-SA 3.0' },
    video: { id: 'k2NZF7gYNtQ', title: '信州最古の温泉地・別所温泉', channel: '別所温泉 / BESSHO ONSEN', official: false }
  },
  {
    id: 'anrakuji', name: '安楽寺', yomi: 'あんらくじ',
    sub: '国宝 八角三重塔',
    area: 'bessho', cat: 'temple', lat: 36.35222, lng: 138.15333, gq: '安楽寺 別所温泉',
    intro: '信州最古の禅寺とされる曹洞宗の古刹。本堂裏の山腹に、国内に唯一残る木造の八角三重塔（国宝）が建つ。',
    points: [
      '国宝・八角三重塔（鎌倉末期、日本最古の禅宗様建築）',
      '重文の木像2体（開山・樵谷惟仙、二世・幼牛恵仁）',
      '黒門・山門・経蔵内の輪蔵、高さ約25mの高野槙'
    ],
    sanada: { type: '関わり未確認', text: '寺の公式サイトに真田氏の記述はなく、直接の関わりは確認できていない。鎌倉期に塩田北条氏の庇護で栄えた。' },
    stay: 50, outdoor: true,
    open: '08:00', last: '15:45', close: '16:00',
    hours: '11〜2月は8:00〜16:00（最終入場15:45）。無休。',
    fee: '大人300円／小中学生100円',
    parking: '普通車50台',
    transit: { level: 'few', text: '別所線「別所温泉駅」から徒歩10分（上田駅から約28分・590円）。' },
    caution: ['塔は本堂裏の山腹。石段を上る'],
    check: [],
    official: 'https://anrakuji.com/',
    photo: { file: 'Octagonal_three_storied_pagoda,_Anrakuji_temple_-_Jan_6,_2011.jpg', author: 'KANEI', license: 'CC BY 2.0' },
    video: { id: 'OOwb3VS_fMw', title: '上田のお宝発見『安楽寺八角三重塔』', channel: '上田市行政チャンネル', official: true }
  },
  {
    id: 'kitamuki', name: '北向観音', yomi: 'きたむきかんのん',
    area: 'bessho', cat: 'temple', lat: 36.34989, lng: 138.15642, gq: '北向観音',
    intro: '本堂が北を向く珍しい厄除観音。南向きの善光寺と両方に参る「両詣り」で知られ、参道には店が並ぶ。',
    points: [
      '北向きの観音堂（善光寺と向き合う厄除観音）',
      '樹齢1200年の愛染カツラ（縁結びの霊木）',
      '温泉の源泉が流れる手水舎と、温泉薬師瑠璃殿'
    ],
    sanada: { type: '関わり未確認', text: '公式サイトに真田氏の記述はなく、直接の関わりは確認できていない。' },
    stay: 35, outdoor: true,
    open: '07:00', close: '16:00',
    hours: '観音堂は11〜3月が7:00〜16:00。御朱印は15:45まで。',
    fee: '参拝無料',
    parking: '近隣のタイムズ別所温泉観音下（34台）',
    transit: { level: 'few', text: '別所線「別所温泉駅」から徒歩約10分（上田駅から約28分・590円）。' },
    caution: ['参道から境内へ石段と坂'],
    check: [],
    official: 'https://www.kitamuki-kannon.com/',
    photo: { file: '260828_Kitamuki-kannon_Ueda_Nagano_pref_Japan01s3.jpg', author: '663highland', license: 'CC BY-SA 4.0' },
    video: { id: 'zWsHAdSLcZw', title: '開運1200年。北向観音・常楽寺 64年ぶりの御開帳', channel: '北向観音・常楽寺 公式チャネル', official: true }
  },

  // ───────── 食事・休憩 ─────────
  {
    id: 'kusabue', name: '草笛 上田お城前店', yomi: 'くさぶえ',
    sub: 'そば・くるみだれ',
    area: 'shigai', cat: 'food', lat: 36.40343, lng: 138.24727, gq: '草笛 上田お城前店',
    intro: '小諸発祥の信州そば店。上田城の目の前にあり、城見学の前後に寄りやすい。',
    points: ['上田城の正面という立地', '信州そば（くるみだれが名物の店）', '土日祝は15:30まで営業'],
    sanada: null,
    stay: 50, outdoor: false,
    open: '11:00', close: '15:30',
    hours: '土日祝 11:00〜15:30。無休。11/22・23とも営業。',
    fee: '',
    parking: '未確認',
    transit: { level: 'good', text: '上田駅から徒歩12分前後（上田城の前）。' },
    caution: [], check: ['お城前店のメニューと駐車場は未確認'],
    tel: '0268-75-8908',
    official: 'https://www.kusabue.co.jp/tenpo/index.html',
    photo: null, video: null
  },
  {
    id: 'onishi', name: '手打百藝 おお西', yomi: 'おおにし',
    sub: '柳町・発芽そば',
    area: 'shigai', cat: 'food', lat: 36.40646, lng: 138.25324, gq: '手打百藝 おお西 上田',
    intro: '柳町の保命水そばにある十割手打ちそばの店。発芽そばと更科そばが看板。',
    points: ['十割の発芽そば', '柳町の町家の店構え', 'そばが無くなり次第閉店'],
    sanada: null,
    stay: 50, outdoor: false,
    open: '11:00', close: '14:00',
    hours: '11:00〜14:00頃（売り切れ次第終了）。木曜定休、不定期の休みあり。',
    fee: '',
    parking: 'なし（コインパーキング）',
    transit: { level: 'good', text: '上田駅から徒歩約15分（柳町）。' },
    caution: ['売り切れ終了。早めの来店を'], check: ['臨時休業の有無は未確認'],
    tel: '0268-24-5381',
    official: 'https://www.ohnishisoba.com/',
    photo: null, video: null
  },
  {
    id: 'misuzu', name: 'みすゞ飴本舗 飯島商店', yomi: 'みすずあめほんぽ',
    sub: '土産・駅前',
    area: 'shigai', cat: 'food', lat: 36.39809, lng: 138.25031, gq: 'みすゞ飴本舗 飯島商店 上田本店',
    intro: 'みすゞ飴の本店。大正13年築の店舗は国の登録有形文化財で、駅から徒歩2分。',
    points: ['登録有形文化財の店舗', 'みすゞ飴と四季のジャム', '駅前なので帰りの土産に'],
    sanada: null,
    stay: 20, outdoor: false,
    open: '10:00', close: '18:00',
    hours: '10:00〜18:00。年中無休（12/31午後と1/1を除く）。',
    fee: '',
    parking: '21台',
    transit: { level: 'good', text: '上田駅から徒歩2分。' },
    caution: [], check: [],
    official: 'https://misuzuame.com/store/ueda-mainstore/',
    photo: null, video: null
  },
  {
    id: 'biranju', name: '食事処 比蘭樹', yomi: 'びらんじゅ',
    sub: 'あいそめの湯内・別所温泉駅前',
    area: 'bessho', cat: 'food', lat: 36.35345, lng: 138.16125, gq: 'あいそめの湯 別所温泉',
    intro: '日帰り温泉「あいそめの湯」内の食事処。別所温泉駅から徒歩1分で、食事だけの利用もできる。',
    points: ['くるみそば・馬肉うどんなど地元の味', '19時まで営業（別所で遅い昼食が取れる）', '電車の待ち時間に使いやすい駅前'],
    sanada: null,
    stay: 45, outdoor: false,
    open: '11:00', last: '18:30', lastLabel: 'ラストオーダー', close: '19:00',
    hours: '11:00〜19:00（オーダーストップ18:30）。11/22・23とも営業。',
    fee: '',
    parking: 'あいそめの湯 約90台',
    transit: { level: 'few', text: '別所線「別所温泉駅」から徒歩1分。' },
    caution: [], check: [],
    official: 'https://www.bessho-spa.jp/aisome/biranju/index.html',
    photo: null, video: null
  }
];

// 交通メモ（「交通・設定」タブに表示）
window.TRANSIT_NOTES = [
  {
    title: '上田市街',
    lines: [
      '主要スポットは上田駅から徒歩10〜15分圏。',
      '市街地循環バス（赤バス・青バス）は日曜・祝日運休。11/22・23は使えない。'
    ],
    links: []
  },
  {
    title: '真田の郷（上田バス 菅平高原線）',
    lines: [
      '11/22・23は日曜・祝日ダイヤ。上田駅→真田方面は1日10本、間隔は最大2時間15分。',
      '所要：夢工房前 約24分／真田 約30分。運賃は真田まで500円の見込み（400円の記載もあり要確認）。',
      '現金またはTicketQRのみ。交通系ICカードは使えない。',
      '郷内はバスが無い。夢工房の無料電動自転車（先着10台）で一周11.2km、見学込み3.5〜4時間。',
      '観光タクシー半日コースは2名で1人16,400円。出発5日前締切。'
    ],
    links: [
      { label: '上田バス 時刻表（菅平高原線）', url: 'https://www.uedabus.co.jp/rosen/20260330sugadaira.pdf' },
      { label: '上田バス 路線一覧', url: 'https://www.uedabus.co.jp/rosen/rosen.html' },
      { label: '観光タクシー半日コース', url: 'https://nagano.visit-town.com/visittour/uedajo-revice-202312' }
    ],
    tel: [{ label: '上田バス', num: '0268-34-6602' }, { label: 'ゆきむら夢工房', num: '0268-72-2204' }]
  },
  {
    title: '別所温泉・塩田平（上田電鉄 別所線）',
    lines: [
      '11/22・23は土休日ダイヤ。約1時間に1本。',
      '上田→別所温泉 約28分・590円／上田→下之郷（生島足島神社）約15分・380円。',
      '1日まるまるフリー切符 1,180円（別所温泉往復と同額。途中下車するなら得）。',
      '上田駅〜別所温泉の路線バス（塩田線）は土日祝は全便運休。',
      '寺社は16時に閉まる。寺社を先、入浴を後に。'
    ],
    links: [
      { label: '別所線 時刻表', url: 'https://www.uedadentetsu.com/timetable/timetable_besshosen.html' },
      { label: '別所線 きっぷ', url: 'https://www.uedadentetsu.com/ticket/' }
    ]
  },
  {
    title: 'レンタカー・自転車',
    lines: [
      '上田駅お城口にレンタカー各社（駅レンタカー、オリックス、ニッポン）。3連休は早めの予約を。',
      '真田の郷は山あい。直前の天気予報で雪の心配があれば冬タイヤ指定を。',
      '電動シェアサイクルは11/30まで営業。上田駅・下之郷駅・別所温泉駅などに置き場。1日パス1,430円〜。'
    ],
    links: [
      { label: 'シェアサイクル（上田市）', url: 'https://www.city.ueda.nagano.jp/soshiki/tosikei/46588.html' }
    ]
  }
];
