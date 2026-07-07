/*!
 * rubiks-spinner.js — ルービックキューブ型ローディングスピナー
 *
 * ■ 使い方（置くだけ）
 *   1. このファイルを読み込む:
 *        <script src="rubiks-spinner.js"></script>
 *   2. 表示したい場所にタグを置く:
 *        <rubiks-spinner></rubiks-spinner>
 *
 * ■ 属性（すべて省略可）
 *   size="48"         表示サイズpx（正方形）。デフォルト 48
 *   speed="300"       1手の回転時間ms。小さいほど速い。デフォルト 300
 *   gap="60"          手と手の間の待機ms。デフォルト 60
 *   moves="10"        スクランブル手数。デフォルト 10
 *   no-orbit          自転を止めて正面視（真正面固定）にする。
 *                     このとき完全に隠れる手は自動で除外される。
 *   logo="logo.svg"   前面（緑の面）に画像を9分割で表示する。
 *                     SVG/PNGなどURL指定可（データURIも可）。正方形画像推奨。
 *                     揃うとロゴが完成し、スクランブル中はバラバラになる。
 *
 * ■ 絵文字をロゴにする
 *   SVGの<text>に絵文字を1文字入れたデータURIを logo に渡せばよい。
 *   ロゴ画像は背景ごとステッカーを覆うため、面の色はSVG内 rect の fill で
 *   自由に決められる。文字・絵文字は白地(#f5f5f0)がおすすめ:
 *     const logoURI = "data:image/svg+xml;utf8," + encodeURIComponent(
 *       `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
 *       `<rect width='100' height='100' fill='#f5f5f0'/>` +
 *       `<text x='50' y='54' font-size='72' text-anchor='middle' ` +
 *       `dominant-baseline='central'>😃</text></svg>`);
 *     sp.setAttribute('logo', logoURI);
 *   注意: 絵文字はOSのフォントで描画されるため、環境により絵柄が変わる
 *   （Mac/iOS=Apple Color Emoji, Windows=Segoe UI Emoji）。
 *   全環境で同じ見た目にしたい場合は Twemoji などの絵文字SVGファイルを
 *   logo に直接指定する。
 *
 *   例: <rubiks-spinner size="48" speed="200" no-orbit></rubiks-spinner>
 *
 * ■ 表示/非表示
 *   通常のDOM要素なので display:none / remove() で消せば
 *   アニメーションも自動停止します（切断時にループを止めます）。
 *
 *   例（fetch中だけ表示）:
 *     const sp = document.createElement('rubiks-spinner');
 *     document.body.appendChild(sp);
 *     await fetch(...);
 *     sp.remove();
 *
 * ■ 依存なし / Shadow DOM使用（外部CSSと干渉しません）
 * ■ prefers-reduced-motion 時は自転を止め、手の回転を高速化します
 */
(() => {
  const TMPL = `
  <style>
    :host{
      display:inline-block;
      width:var(--size,120px);
      height:var(--size,120px);
    }
    .vp{width:100%;height:100%;perspective:calc(var(--size,120px)*5)}
    .space{
      width:100%;height:100%;
      transform-style:preserve-3d;
      transform:rotateX(-26deg) rotateY(-30deg);
    }
    .space.orbit{animation:orbit 14s linear infinite}
    @keyframes orbit{
      from{transform:rotateX(-26deg) rotateY(-30deg)}
      to  {transform:rotateX(-26deg) rotateY(330deg)}
    }
    .cubelet{
      position:absolute;left:50%;top:50%;
      width:var(--s);height:var(--s);
      margin-left:calc(var(--s)/-2);
      margin-top:calc(var(--s)/-2);
      transform-style:preserve-3d;
    }
    .face{
      position:absolute;inset:0;
      background:var(--plastic,#0b0c0e);
      border-radius:12%;
      border:1px solid var(--plastic,#0b0c0e);
      backface-visibility:hidden;
    }
    .face::after{
      content:"";position:absolute;inset:7%;border-radius:14%;
      background:var(--fc,var(--plastic,#0b0c0e));
    }
    /* ロゴ面: ステッカーの上に9分割した画像タイルを重ねる */
    .face.logo::after{
      background-image:var(--logo);
      background-size:300% 300%;
      background-position:var(--lp);
      background-repeat:no-repeat;
    }
    .fU{transform:rotateX( 90deg) translateZ(calc(var(--s)/2))}
    .fD{transform:rotateX(-90deg) translateZ(calc(var(--s)/2))}
    .fF{transform:              translateZ(calc(var(--s)/2))}
    .fB{transform:rotateY(180deg) translateZ(calc(var(--s)/2))}
    .fR{transform:rotateY( 90deg) translateZ(calc(var(--s)/2))}
    .fL{transform:rotateY(-90deg) translateZ(calc(var(--s)/2))}
    @media (prefers-reduced-motion: reduce){
      .space.orbit{animation:none}
    }
  </style>
  <div class="vp"><div class="space"></div></div>`;

  const COLORS = {
    U:'#f5f5f0', D:'#ffd500', F:'#009b48',
    B:'#0046ad', R:'#b71234', L:'#ff5800'
  };

  class RubiksSpinner extends HTMLElement {
    connectedCallback(){
      const size  = parseInt(this.getAttribute('size'))  || 48;
      this._speed = parseInt(this.getAttribute('speed')) || 300;
      this._moves = parseInt(this.getAttribute('moves')) || 10;
      const gapAttr = parseInt(this.getAttribute('gap'));
      this._gap = Number.isNaN(gapAttr) ? 60 : gapAttr;   // 手間の待機ms
      const logo  = this.getAttribute('logo');
      this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

      const root = this.attachShadow({mode:'open'});
      root.innerHTML = TMPL;
      this.style.setProperty('--size', size+'px');

      const space = root.querySelector('.space');
      this._frontView = this.hasAttribute('no-orbit');
      if (this._frontView) space.style.transform = 'none';   // 正面視で静止
      else space.classList.add('orbit');

      // cubelet size: cube spans ~3.15 units of S within the box
      const S = size / 3.15;
      const STEP = S * 1.035; // small gap

      // ロゴ指定時は前面が白地ロゴになるため、上面(白)と前面(緑)の色を
      // 入れ替えて白が2面にならないようにする
      const C = logo ? {...COLORS, U:COLORS.F, F:COLORS.U} : COLORS;

      this._cubelets = [];
      for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++){
        if (!x && !y && !z) continue;
        const el = document.createElement('div');
        el.className = 'cubelet';
        el.style.setProperty('--s', S+'px');
        const st = {fU:y===-1&&C.U, fD:y===1&&C.D, fF:z===1&&C.F,
                    fB:z===-1&&C.B, fR:x===1&&C.R, fL:x===-1&&C.L};
        for (const [cls,col] of Object.entries(st)){
          const f = document.createElement('div');
          f.className = 'face '+cls;
          if (col) f.style.setProperty('--fc', col);
          // 前面(z=1)のステッカーにロゴを9分割で貼る
          if (logo && cls==='fF' && z===1){
            f.classList.add('logo');
            f.style.setProperty('--logo', `url("${logo}")`);
            // x:-1→0%(左) 0→50% 1→100%(右) / y:-1→0%(上) 0→50% 1→100%(下)
            f.style.setProperty('--lp', `${(x+1)*50}% ${(y+1)*50}%`);
          }
          el.appendChild(f);
        }
        space.appendChild(el);
        const m = new DOMMatrix().translate(x*STEP, y*STEP, z*STEP);
        el.style.transform = m.toString();
        this._cubelets.push({el, x, y, z, m});
      }

      this._alive = true;
      this._run();
    }

    disconnectedCallback(){ this._alive = false; }

    /* ---- internals ---- */

    _axisRot(axis, deg){
      const r = new DOMMatrix();
      if (axis==='x') return r.rotateAxisAngle(1,0,0,deg);
      if (axis==='y') return r.rotateAxisAngle(0,1,0,deg);
      return r.rotateAxisAngle(0,0,1,deg);
    }

    _rotCoord(c, axis, dir){
      const {x,y,z} = c;
      if (axis==='x'){ c.y = dir>0 ? -z :  z; c.z = dir>0 ?  y : -y; }
      if (axis==='y'){ c.x = dir>0 ?  z : -z; c.z = dir>0 ? -x :  x; }
      if (axis==='z'){ c.x = dir>0 ? -y :  y; c.y = dir>0 ?  x : -x; }
    }

    _doMove(axis, layer, dir){
      return new Promise(res => {
        const group = this._cubelets.filter(c => c[axis] === layer);
        const dur = this._reduced ? 40 : this._speed;
        const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
        const t0 = performance.now();
        const tick = now => {
          if (!this._alive) return res();
          const t = Math.min((now-t0)/dur, 1);
          const R = this._axisRot(axis, ease(t)*90*dir);
          for (const c of group) c.el.style.transform = R.multiply(c.m).toString();
          if (t < 1) requestAnimationFrame(tick);
          else {
            const R90 = this._axisRot(axis, 90*dir);
            for (const c of group){
              c.m = R90.multiply(c.m);
              c.el.style.transform = c.m.toString();
              this._rotCoord(c, axis, dir);
            }
            res();
          }
        };
        requestAnimationFrame(tick);
      });
    }

    async _run(){
      const sleep = ms => new Promise(r=>setTimeout(r,ms));
      const rand = a => a[Math.floor(Math.random()*a.length)];
      const AXES = ['x','y','z'];
      const randomMove = prev => {
        // 正面視(no-orbit)だと前面レイヤー以外のz軸回転は完全に隠れる
        const isHidden = (axis, layer) => axis==='z' && layer!==1;
        let axis, layer, dir;
        do {
          axis = rand(AXES); layer = rand([-1,0,1]); dir = rand([1,-1]);
        } while (
          (prev && axis===prev.axis && layer===prev.layer && dir===-prev.dir) ||
          (this._frontView && isHidden(axis, layer))
        );
        return {axis, layer, dir};
      };

      await sleep(400);
      while (this._alive){
        const n = this._moves || (5 + Math.floor(Math.random()*3));
        const moves = [];
        let prev = null;
        for (let i=0;i<n && this._alive;i++){
          const mv = randomMove(prev);
          moves.push(mv); prev = mv;
          await this._doMove(mv.axis, mv.layer, mv.dir);
          await sleep(this._gap);
        }
        await sleep(400);
        for (let i=moves.length-1;i>=0 && this._alive;i--){
          const mv = moves[i];
          await this._doMove(mv.axis, mv.layer, -mv.dir);
          await sleep(this._gap);
        }
        await sleep(600);
      }
    }
  }

  customElements.define('rubiks-spinner', RubiksSpinner);
})();
