import { Shader, Texture } from '../minigl.js'

export function filterInsta(mini, opt, mix){
  //console.log('filterInsta',opt,mix)
  const {gl} = mini
  mix+=1

  const srgb_linear_fn = `
    vec3 fromLinear(vec3 linearRGB) {
        bvec3 cutoff = lessThan(linearRGB.rgb, vec3(0.0031308));
        vec3 higher = vec3(1.055)*pow(linearRGB.rgb, vec3(1.0/2.4)) - vec3(0.055);
        vec3 lower = linearRGB.rgb * vec3(12.92);
        return vec3(mix(higher, lower, cutoff));
    }
    vec3 toLinear(vec3 sRGB) {
        bvec3 cutoff = lessThan(sRGB.rgb, vec3(0.04045));
        vec3 higher = pow((sRGB.rgb + vec3(0.055))/vec3(1.055), vec3(2.4));
        vec3 lower = sRGB.rgb/vec3(12.92);
        return vec3(mix(higher, lower, cutoff));
    }`

  if(opt.type==='1'){
    /// SHADER 1: vertical LUT 33x10889px
    //ADEN, CREMA, JUNO, LARK, LUDWIG, REYES
    const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform float filterStrength;

        ${srgb_linear_fn}

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
          texel = fromLinear(texel);
          float size = 33.0;
          float sliceSize = 1.0 / size;
          float slicePixelSize = sliceSize / size;
          float sliceInnerSize = slicePixelSize * (size - 1.0);
          float xOffset = 0.5 * sliceSize + texel.x * (1.0 - sliceSize);
          float yOffset = 0.5 * slicePixelSize + texel.y * sliceInnerSize;
          float zOffset = texel.z * (size - 1.0);
          float zSlice0 = floor(zOffset);
          float zSlice1 = zSlice0 + 1.0;
          float s0 = yOffset + (zSlice0 * sliceSize);
          float s1 = yOffset + (zSlice1 * sliceSize);
          vec4 slice0Color = texture(map, vec2(xOffset, s0));
          vec4 slice1Color = texture(map, vec2(xOffset, s1));
          texel =  mix(slice0Color, slice1Color, zOffset - zSlice0).rgb;
          texel = toLinear(texel);
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta1 = mini._.$insta1 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl);
    mini._.$instatxt1.loadImage(opt.map1, gl.RGBA)
    mini._.$instatxt1.use(1);
    mini.runFilter(mini._.$insta1, { filterStrength: mix??1, map:{unit:1} });
  }
  else if(opt.type==='2'){
    //SHADER 2: 2x horizontal curve 256x1 (map1=luma, map2=rgb)
    //CLARENDON
    //NOTE: color is linear -> load LUTs as linear -> map color-to-srgb vs LUT -> return linear 
    const _fragment = `#version 300 es
        precision highp float;
        precision highp int;
        
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform sampler2D map2;
        uniform float filterStrength;

        ${srgb_linear_fn}

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
          texel = fromLinear(texel);
          texel.r = texture(map, vec2(texel.r, 0.5)).r;
          texel.g = texture(map, vec2(texel.g, 0.5)).g;
          texel.b = texture(map, vec2(texel.b, 0.5)).b;
          float luma = dot(vec3(0.2126, 0.7152, 0.0722), texel);
          float shadowCoeff = 0.35 * max(0.0, 1.0 - luma);
          texel = mix(texel, max(vec3(0.0), 2.0 * texel - 1.0), shadowCoeff);
          texel = mix(texel, vec3(luma), -0.3);
          texel.r = texture(map2, vec2(texel.r, 0.5)).r;
          texel.g = texture(map2, vec2(texel.g, 0.5)).g;
          texel.b = texture(map2, vec2(texel.b, 0.5)).b;
          texel = toLinear(texel);
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          color = color * (1.0 - filterStrength) + lut(color) * filterStrength;
          outColor = color;
        }
    `
    mini._.$insta2 = mini._.$insta2 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl);
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl);
    mini._.$instatxt1.loadImage(opt.map1, gl.RGBA)
    mini._.$instatxt2.loadImage(opt.map2, gl.RGBA)

    mini._.$instatxt1.use(1);
    mini._.$instatxt2.use(2);
    mini.runFilter(mini._.$insta2, { filterStrength: mix??1, map:{unit:1}, map2:{unit:2} });
  }
  else if(opt.type==='3'){
    //SHADER 3: 2x horizontal curve 256x1 (map e mapLgg)
    //GINGHAM
    const _fragment = `#version 300 es
        precision highp float;
        precision highp int;
        
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform sampler2D mapLgg;
        uniform float filterStrength;

        ${srgb_linear_fn}

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
          texel = fromLinear(texel);
          texel = min(texel * 1.1343, vec3(1.0));
          texel.r = texture(map, vec2(texel.r, 0.5)).r;
          texel.g = texture(map, vec2(texel.g, 0.5)).g;
          texel.b = texture(map, vec2(texel.b, 0.5)).b;
          vec3 shadowColor = vec3(0.956862, 0.0, 0.83529);
          float luma = dot(vec3(0.309, 0.609, 0.082), texel);
          vec3 shadowBlend = 2.0 * shadowColor * texel;
          float shadowAmount = 0.6 * max(0.0, (1.0 - 4.0 * luma));
          texel = mix(texel, shadowBlend, shadowAmount);
          vec3 lgg;
          lgg.r = texture(mapLgg, vec2(texel.r, 0.5)).r;
          lgg.g = texture(mapLgg, vec2(texel.g, 0.5)).g;
          lgg.b = texture(mapLgg, vec2(texel.b, 0.5)).b;
          texel = mix(texel, lgg, min(1.0, 0.8 + luma));
          texel = toLinear(texel);
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta3 = mini._.$insta3 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt1.loadImage(opt.map1, gl.RGBA)
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt2.loadImage(opt.map2, gl.RGBA)

    mini._.$instatxt1.use(1);
    mini._.$instatxt2.use(2);
    mini.runFilter(mini._.$insta3, { filterStrength: mix??1, map:{unit:1}, mapLgg:{unit:2} });
  }
  else if(opt.type==='4'){
    //SHADER 4: 2x horizontal curve 256x1 (map1=desat e map2=rgb)
    //MOON
    const _fragment = `#version 300 es
        precision highp float;
        precision highp int;
        
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform sampler2D map2;
        uniform float filterStrength;

        ${srgb_linear_fn}

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
          texel = fromLinear(texel);
          texel.r = texture(map, vec2(texel.r, 0.5)).r;
          texel.g = texture(map, vec2(texel.g, 0.5)).g;
          texel.b = texture(map, vec2(texel.b, 0.5)).b;
          vec3 desat = vec3(dot(vec3(0.7, 0.2, 0.1), texel));
          texel = mix(texel, desat, 0.79);
          texel = vec3(min(1.0, 1.2 * dot(vec3(0.2, 0.7, 0.1), texel)));
          texel.r = texture(map2, vec2(texel.r, 0.5)).r;
          texel.g = texture(map2, vec2(texel.g, 0.5)).g;
          texel.b = texture(map2, vec2(texel.b, 0.5)).b;
          texel = toLinear(texel);
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta4 = mini._.$insta4 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt1.loadImage(opt.map1, gl.RGBA)
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt2.loadImage(opt.map2, gl.RGBA)

    mini._.$instatxt1.use(1);
    mini._.$instatxt2.use(2);
    mini.runFilter(mini._.$insta4, { filterStrength: mix??1, map:{unit:1}, map2:{unit:2} });
  }
  else if(opt.type==='MTX'){

    //COLORMATRIX (eg from pixie.js)

    const _fragment = `#version 300 es
        precision highp float;
        precision highp int;
        
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform float filterStrength;
        uniform mat4 uColorMatrix;
        uniform vec4 uColorOffset;

        vec4 applyColorMatrix(vec4 c, mat4 m, vec4 o) {
            vec4 res = (c * m) + (o * c.a);
            res = clamp(res, 0.0, 1.0);
            return res;
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          color = applyColorMatrix(color, uColorMatrix, uColorOffset);
          outColor = color;
        }
    `


    let colormatrix={ //[r,g,b,a,w]
      identity: [
        [1,0,0,0,0],
        [0,1,0,0,0],
        [0,0,1,0,0],
        [0,0,0,1,0],
      ],
      polaroid: [
          [1+.438*mix, -0.062*mix, -0.062*mix, 0, 0,],
          [-0.122*mix, 1+.378*mix, -0.122*mix, 0, 0,],
          [-0.016*mix, -0.016*mix, 1+.483*mix, 0, 0,],
          [0, 0, 0, 1, 0,]
      ],
      kodachrome:[
          [(1+.1285582396593525*mix)*((mix/2+1)/2+0.5), -0.3967382283601348*mix, -0.03992559172921793*mix, 0, 0.06372958762196502*mix,],
          [-0.16404339962244616*mix, (1+.0835251566291304*mix)*((mix/2+1)/2+0.5), -0.05498805115633132*mix, 0, 0.024732407896706203*mix,],
          [-0.16786010706155763*mix, -0.5603416277695248*mix, (1+.6014850761964943*mix)*((mix/2+1)/2+0.5), 0, 0.03562982807460946*mix,],
          [0, 0, 0, 1, 0,]
      ],
      browni: [
          [(1-0.4002976502*mix)*((mix/1.5+1)/2+0.5), 0.34553243048391263*mix, -0.2708298674538042*mix, 0, 47.43192855600873/500*mix,],
          [-0.037703249837783157*mix, (1-0.1390422412*mix)*((mix/1.5+1)/2+0.5), 0.15059552388459913*mix, 0, -36.96841498319127/500*mix,],
          [0.24113635128153335*mix, -0.07441037908422492*mix, (1-0.5502781794*mix)*((mix/1.5+1)/2+0.5), 0, -7.562075277591283/500*mix,],
          [0, 0, 0, 1, 0,]
      ],
      vintage: [
          [(1-0.3720654364*mix)*((mix/1.5+1)/2+0.5), 0.3202183420819367*mix, -0.03965408211312453*mix, 0, 9.651285835294123/1000*mix,],
          [0.02578397704808868*mix, (1-0.3558811356*mix)*((mix/1.5+1)/2+0.5), 0.03259127616149294*mix, 0, 7.462829176470591/1000*mix,],
          [0.0466055556782719*mix, -0.0851232987247891*mix, (1-0.4758351981*mix)*((mix/1.5+1)/2+0.5), 0, 5.159190588235296/1000*mix,],
          [0, 0, 0, 1, 0,]
      ],
    }

    let cMatrix=colormatrix.identity
    let cOffset = [0,0,0,0]

    if(mix) cMatrix = multiplyM(cMatrix,colormatrix[opt.mtx], 4)
    if(mix) cOffset = [0,1,2,3].map(i=> cOffset[i]+colormatrix[opt.mtx][i][4])
      
    mini._.$insta5 = mini._.$insta5 || new Shader(gl, null, _fragment);
    const uColorMatrix = cMatrix.flat();
    const uColorOffset = cOffset;
    mini.runFilter(mini._.$insta5, { uColorMatrix, uColorOffset });
  }
}

  function multiplyM(A, B, N=3) {
      let C=[];
      for (var i = 0; i < N; i++)
      {
          C.push([])
          for (var j = 0; j < N; j++)
          {
              C[i].push(0)
              for (var k = 0; k < N; k++)
              {
                  if(A[i]&&B[k]) C[i][j] += A[i][k]*B[k][j];
              }
          }
      }
      return C
  }
