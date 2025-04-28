import { Shader, Texture } from './minigl.js'
import { Spline } from './cubicspline.js'


export function filterMatrix(mini,params){
  const {gl,img}=mini
  //console.log('filterMatrix')
  params=params||{translateX:0,translateY:0,angle:0,scale:0,flipv:0,fliph:0};
  let {translateX,translateY,angle,scale:_scale,flipv,fliph} = params
  _scale+=1 //in order to use -1/+1 range as scale input, so that 0 = 1:1 scale
  let scale=[_scale,_scale]
  //convert translateX/Y from clip space(0-1) to pixel space
  const translation = [
        Math.round(gl.canvas.width*translateX*100)/100,
        Math.round(gl.canvas.height*translateY*100)/100,
  ]

    const _vertex = `#version 300 es
        in vec2 vertex;
        uniform mat3 matrix;
        out vec2 texCoord;
        void main() {
          texCoord = vertex;
          gl_Position = vec4((matrix * vec3(vertex, 1)).xy, 0, 1);
        }
      `

    const _fragment = `#version 300 es
        precision highp float;
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;   
        void main() {
          outColor = texture(_texture, vec2(texCoord.x, texCoord.y));
        }
      ` 

  //const {img} = gl._
  if(gl.canvas.width===img.height){ //rotated canvas
    const aspectratio = img.width/img.height    
    scale[0]*=aspectratio
    scale[1]/=aspectratio
  }
  // Compute the matrices
  const projectionMatrix = m3.projection(gl.canvas.width, gl.canvas.height);
  const translationMatrix = m3.translation(translation[0], translation[1]);
  const rotationMatrix = m3.rotation(-angle * Math.PI / 180);
  const scaleMatrix = m3.scaling(scale[0]*(-fliph||1), scale[1]*(-flipv||1));
  
  //center crop selection
  let crop_translationMatrix

  let matrix = [1,0,0,0,1,0,0,0,1] //identity matrix
  matrix = m3.multiply(matrix, projectionMatrix);
  //matrix = m3.multiply(matrix, _scaleMatrix);
  matrix = m3.multiply(matrix, translationMatrix);
  //set pivot at the center of the image
  matrix = m3.multiply(matrix, m3.translation(gl.canvas.width/2, gl.canvas.height/2))
  matrix = m3.multiply(matrix, rotationMatrix);
  matrix = m3.multiply(matrix, scaleMatrix);
  //reset pivot
  matrix = m3.multiply(matrix, m3.translation(-gl.canvas.width/2, -gl.canvas.height/2))
  // scale our 1 unit quad from 1 unit to img width & height
  matrix = m3.multiply(matrix, m3.scaling(gl.canvas.width, gl.canvas.height))
  //setup and run effect
  mini._.$matrix = mini._.$matrix || new Shader(gl, _vertex, _fragment)
  mini.runFilter(mini._.$matrix, {matrix})
}

export function filterAdjustments(mini, effects) {
  //console.log('filterAdjustments')
      //copied from https://pqina.nl/pintura/
      //https://tsev.dev/posts/2020-06-19-colour-correction-with-webgl/

      //for some examples https://api.pixijs.io/@pixi/filter-color-matrix/src/ColorMatrixFilter.ts.html

      const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform vec2 uTextureSize;
        uniform mat4 uColorMatrix;
        uniform vec4 uColorOffset;
        uniform float uClarityKernel[9];
        uniform float uClarityKernelWeight;
        uniform float uColorGamma;
        uniform float uVibrance;
        uniform float uColorVignette;
        uniform vec2 uVignettePos;
        uniform float vibrance;

        vec4 applyGamma(vec4 c, float g) {
            c.r = pow(c.r, g);
            c.g = pow(c.g, g);
            c.b = pow(c.b, g);
            return c;
        }
        vec4 applyVibrance(vec4 c, float v){
          float max = max(c.r, max(c.g, c.b));
          float avg = (c.r + c.g + c.b) / 3.0;
          float amt = (abs(max - avg) * 2.0) * -v;
          c.r += max != c.r ? (max - c.r) * amt : 0.00;
          c.g += max != c.g ? (max - c.g) * amt : 0.00;
          c.b += max != c.b ? (max - c.b) * amt : 0.00;
          return c;
        }
        vec4 applyColorMatrix(vec4 c, mat4 m, vec4 o) {
            vec4 res = (c * m) + (o * c.a);
            res = clamp(res, 0.0, 1.0);
            return res;
        }
        vec4 applyConvolutionMatrix(vec4 c, float k0, float k1, float k2, float k3, float k4, float k5, float k6, float k7, float k8, float w) {
          vec2 pixel = vec2(1) / uTextureSize;
          vec4 colorSum = texture(_texture, texCoord - pixel) * k0 + texture(_texture, texCoord + pixel * vec2(0.0, -1.0)) * k1 + texture(_texture, texCoord + pixel * vec2(1.0, -1.0)) * k2 + texture(_texture, texCoord + pixel * vec2(-1.0, 0.0)) * k3 + texture(_texture, texCoord) * k4 + texture(_texture, texCoord + pixel * vec2(1.0, 0.0)) * k5 + texture(_texture, texCoord + pixel * vec2(-1.0, 1.0)) * k6 + texture(_texture, texCoord + pixel * vec2(0.0, 1.0)) * k7 + texture(_texture, texCoord + pixel) * k8;
          vec4 color = vec4(clamp((colorSum / w), 0.0, 1.0).rgb, c.a);
          return color;
        }

        vec4 applyVignette2(vec4 c, vec2 pos, float v, vec2 upos){
          #define inner .65
          #define outer 1.2
          #define curvature .85
          vec2 curve = pow(abs(pos),vec2(1./curvature));
          float edge = pow(length(curve),curvature);
          float scale = 1.-abs(upos.x);
          float vignette = 1.-v*smoothstep(inner*scale,outer*scale,edge);
          vec4 color = vec4(c.rgb *= vignette, c.a);
          return color;
        }

        vec4 vignette3(vec4 c, vec2 pos, float radius)
        {
            float ambientlight = 0.14;
            float circle = length(pos) - radius;
            float v = 1.0 - smoothstep(0.0, 0.4f, circle) + ambientlight;
            return vec4(c.rgb*v,c.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          if (uClarityKernelWeight != -1.0) { 
            color = applyConvolutionMatrix(color, uClarityKernel[0], uClarityKernel[1], uClarityKernel[2], uClarityKernel[3], uClarityKernel[4], uClarityKernel[5], uClarityKernel[6], uClarityKernel[7], uClarityKernel[8], uClarityKernelWeight); 
          } 
          color = applyGamma(color, uColorGamma);
          color = applyVibrance(color, uVibrance);
          color = applyColorMatrix(color, uColorMatrix, uColorOffset);
          if (uColorVignette != 0.0) {
            vec2 pos = texCoord.xy*2.-1. - uVignettePos;
            //color = vignette3(color, pos, uColorVignette);
            color = applyVignette2(color, pos, uColorVignette, uVignettePos);
          }
          outColor = color;
        }
      `

      const {gl,img} = mini
      const {width,height} = img

      let vignpos = [0,0]

      let {brightness: b, contrast: c, saturation: s, exposure: e, temperature: t, gamma, clarity: l, vibrance, vignette, tint:tt, sepia:sp, gray:g} = effects
      b=b/4;c=(c+1)/2+0.5;s+=1;e=(e+1)/2+0.5;gamma+=1;
      
      let colormatrix={ //[r,g,b,a,w]
        //brightness t (0-2)
        brightness: [
          [1, 0, 0, 0, b, ],
          [0, 1, 0, 0, b, ],
          [0, 0, 1, 0, b, ],
          [0, 0, 0, 1, 0]
        ],
        //constrast t (0-2)
        contrast: [ 
          [c, 0, 0, 0, 0.5 * (1 - c), ],
          [0, c, 0, 0, 0.5 * (1 - c), ],
          [0, 0, c, 0, 0.5 * (1 - c), ],
          [0, 0, 0, 1, 0]
        ],
        //saturation (0-2)
        saturation: [
          [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0, ],
          [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0, ],
          [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0, ],
          [0, 0, 0, 1, 0]
        ],
        //exposure (0-2)
        exposure: [
          [e, 0, 0, 0, 0, ],
          [0, e, 0, 0, 0, ],
          [0, 0, e, 0, 0, ],
          [0, 0, 0, 1, 0]
        ],
        //temperature (-1 +1)
        temperature: t > 0 ? [
          [1 + .1 * t, 0, 0, 0, 0, ],
          [0, 1, 0, 0, 0, ],
          [0, 0, 1 + .1 * -t, 0, 0, ],
          [0, 0, 0, 1, 0]
        ] : [
          [1 + .15 * t, 0, 0, 0, 0, ],
          [0, 1 + .05 * t, 0, 0, 0, ],
          [0, 0, 1 + .15 * -t, 0, 0, ],
          [0, 0, 0, 1, 0]
        ],
        //tint 
        tint: [
          [1,0,0,0,0],
          [0,1+0.1*tt,0,0,0],
          [0,0,1,0,0],
          [0,0,0,1,0],
        ],
        //sepia 
        sepia: [
          [1-.607*sp,.769*sp,.189*sp,0,0],
          [.349*sp,1-.314*sp,.168*sp,0,0],
          [.272*sp,.534*sp,1-.869*sp,0,0],
          [0,0,0,1,0],
        ],
        //same as saturation!
        gray: [
          [1-.7874*g,.7152*g,.0722*g,0,0],
          [.2126*g,1-.2848*g,.0722*g,0,0],
          [.2126*g,.7152*g,1-.9278*g,0,0],
          [0,0,0,1,0],
        ],
        identity: [
          [1,0,0,0,0],
          [0,1,0,0,0],
          [0,0,1,0,0],
          [0,0,0,1,0],
        ],
      }

      let cMatrix=colormatrix.identity
      let cOffset = [0,0,0,0]
      cMatrix = multiplyM(cMatrix,colormatrix.brightness, 4)
      cOffset= [0,1,2,3].map(i=> cOffset[i]+colormatrix.brightness[i][4])
      cMatrix = multiplyM(cMatrix,colormatrix.contrast, 4)
      cOffset =[0,1,2,3].map(i=> cOffset[i]+colormatrix.contrast[i][4])
      cMatrix = multiplyM(cMatrix,colormatrix.saturation, 4)
      cMatrix = multiplyM(cMatrix,colormatrix.exposure, 4)
      cMatrix = multiplyM(cMatrix,colormatrix.temperature, 4)
      cMatrix = multiplyM(cMatrix,colormatrix.tint, 4)
      cMatrix = multiplyM(cMatrix,colormatrix.sepia, 4)


      let claritykernel = l >= 0 ? [
          0, -1 * l, 0, 
          -1 * l, 1 + 4 * l, -1 * l, 
          0, -1 * l, 0
        ] : [
          -1 * l, -2 * l, -1 * l, 
          -2 * l, 1 + -3 * l, -2 * l, 
          -1 * l, -2 * l, -1 * l
        ]
      let clarityweight = claritykernel.reduce(((e, t) => e + t), 0)
      clarityweight = clarityweight <= 0 ? 1 : clarityweight
      //clarity kernel has lenght=9, as a 3x3 matrix .. envelop in an array for Shader.uniforms to recognise it as a float array[]
      claritykernel = [claritykernel] 

      //const {temperature,tint} = effects
      const uColorMatrix = cMatrix.flat();
      const uColorOffset = cOffset;
      const uTextureSize = [width,height];
      const uVibrance=vibrance;
      const uColorVignette=vignette;
      const uClarityKernel=claritykernel;
      const uClarityKernelWeight=clarityweight;
      const uVignettePos=vignpos;


      //setup and run effect
      mini._.$adj = mini._.$adj || new Shader(gl, null, _fragment)
      mini.runFilter(mini._.$adj, {uColorMatrix, uColorOffset, uColorGamma:1/gamma, uClarityKernel, uClarityKernelWeight, uTextureSize, uVibrance, uColorVignette, uVignettePos})
}

export function filterHighlightsShadows(mini,val1,val2){
  //SHADOWS-HIGHLIGHTS - https://stackoverflow.com/questions/26511037/how-can-i-modify-this-webgl-fragment-shader-to-increase-brightness-of-highlights
  const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform float shadows;
        uniform float highlights;

        const mediump vec3 luminanceWeighting = vec3(0.2125, 0.7154, 0.0721);

        void main() {
          vec4 color = texture(_texture, texCoord);

          float luminance = dot(color.rgb, luminanceWeighting);
          float shadow = clamp((pow(luminance, 1.0/shadows) + (-0.76)*pow(luminance, 2.0/shadows)) - luminance, 0.0, 1.0);
          float highlight = clamp((1.0 - (pow(1.0-luminance, 1.0/(2.0-highlights)) + (-0.8)*pow(1.0-luminance, 2.0/(2.0-highlights)))) - luminance, -1.0, 0.0);
          vec3 result = vec3(0.0, 0.0, 0.0) + (luminance + shadow + highlight) * ((color.rgb - vec3(0.0, 0.0, 0.0))/luminance );

          // blend toward white if highlights is more than 1
          float contrastedLuminance = ((luminance - 0.5) * 1.5) + 0.5;
          float whiteInterp = contrastedLuminance*contrastedLuminance*contrastedLuminance;
          float whiteTarget = clamp(highlights, 0.0, 2.0) - 1.0;
          result = mix(result, vec3(1.0), whiteInterp*whiteTarget);

          // blend toward black if shadows is less than 1
          float invContrastedLuminance = 1.0 - contrastedLuminance;
          float blackInterp = invContrastedLuminance*invContrastedLuminance*invContrastedLuminance;
          float blackTarget = 1.0 - clamp(shadows, 0.0, 1.0);
          result = mix(result, vec3(0.0), blackInterp*blackTarget);

          outColor = vec4(result, color.a);
        }
  `
    const {gl}=mini
    //setup and run effect
    mini._.$sg = mini._.$sg || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$sg, { highlights:val1+1, shadows: val2+1 } )
}

export function filterBloom(mini,val){
  //BLOOM - https://www.shadertoy.com/view/Ms2Xz3
  const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform vec2 uResolution;
        uniform float filterStrength;


        vec4 BlurColor (in vec2 Coord, in sampler2D Tex, in float MipBias)
        {
            vec2 TexelSize = MipBias/uResolution.xy;
            vec4  Color = texture(Tex, Coord, MipBias);
            Color += texture(Tex, Coord + vec2(TexelSize.x,0.0), MipBias);      
            Color += texture(Tex, Coord + vec2(-TexelSize.x,0.0), MipBias);     
            Color += texture(Tex, Coord + vec2(0.0,TexelSize.y), MipBias);      
            Color += texture(Tex, Coord + vec2(0.0,-TexelSize.y), MipBias);     
            Color += texture(Tex, Coord + vec2(TexelSize.x,TexelSize.y), MipBias);      
            Color += texture(Tex, Coord + vec2(-TexelSize.x,TexelSize.y), MipBias);     
            Color += texture(Tex, Coord + vec2(TexelSize.x,-TexelSize.y), MipBias);     
            Color += texture(Tex, Coord + vec2(-TexelSize.x,-TexelSize.y), MipBias);    
            return Color/9.0;
        }

        void main() {
          float Threshold = 0.4;
          float Intensity = filterStrength*1.0;
          float BlurSize = 3.0 * Intensity;

          vec4 color = texture(_texture, texCoord);
          vec4 Highlight = clamp(BlurColor(texCoord.xy, _texture, BlurSize)-Threshold,0.0,1.0)*1.0/(1.0-Threshold);
          outColor = 1.0-(1.0-color)*(1.0-Highlight*Intensity); //Screen Blend Mode
        }
  `
    const {gl,img}=mini
    const {width,height} = img
    const uResolution = [width,height];
    mini._.$bloom = mini._.$bloom || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$bloom, { filterStrength: val, uResolution });
}

export function filterNoise(mini,val){
  //BILATER FILTER  https://www.shadertoy.com/view/4dfGDH
  const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform vec2 uResolution;
        uniform float filterStrength;

        #define SIGMA 10.0
        #define BSIGMA 0.1
        #define MSIZE 15

        float normpdf(in float x, in float sigma)
        {
          return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
        }

        float normpdf3(in vec3 v, in float sigma)
        {
          return 0.39894*exp(-0.5*dot(v,v)/(sigma*sigma))/sigma;
        }

        vec4 applyFilter(vec4 c, sampler2D _texture, vec2 texCoord) {

          const int kSize = (MSIZE-1)/2;
          float kernel[MSIZE] = float[MSIZE](0.031225216, 0.033322271, 0.035206333, 0.036826804, 0.038138565, 0.039104044, 0.039695028, 0.039894000, 0.039695028, 0.039104044, 0.038138565, 0.036826804, 0.035206333, 0.033322271, 0.031225216);
          vec3 final_colour = vec3(0.0);
          
          vec3 cc;
          float factor;
          float Z = 0.0;
          float bZ = 1.0/normpdf(0.0, BSIGMA);
          for (int i=-kSize; i <= kSize; ++i)
          {
            for (int j=-kSize; j <= kSize; ++j)
            {
              cc = texture(_texture, (texCoord.xy+vec2(float(i),float(j))/uResolution)).rgb;
              factor = normpdf3(cc-c.rgb, BSIGMA)*bZ*kernel[kSize+j]*kernel[kSize+i];
              Z += factor;
              final_colour += factor*cc;
            }
          }
          
          return vec4(final_colour/Z, 1.0);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          color = color * (1.0 - filterStrength) + applyFilter(color, _texture, texCoord) * filterStrength;
          outColor = color;
        }
  `
    const {gl,img}=mini
    const {width,height} = img
    const uResolution = [width,height];
    mini._.$noise = mini._.$noise || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$noise, { filterStrength: val, uResolution });
}

export function filterInsta(mini, opt, mix){
  //console.log('filterInsta',opt,mix)
  const {gl} = mini
  mix+=1
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

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
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
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta1 = mini._.$insta1 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl);
    mini._.$instatxt1.loadImage(opt.map1)
    mini._.$instatxt1.use(1);
    mini.runFilter(mini._.$insta1, { filterStrength: mix??1, map:{unit:1} });
  }
  else if(opt.type==='2'){
    //SHADER 2: 2x horizontal curve 256x1 (map1=luma, map2=rgb)
    //CLARENDON
    const _fragment = `#version 300 es
        precision highp float;
        precision highp int;
        
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D map;
        uniform sampler2D map2;
        uniform float filterStrength;

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
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
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta2 = mini._.$insta2 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl);
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl);
    mini._.$instatxt1.loadImage(opt.map1)
    mini._.$instatxt2.loadImage(opt.map2)

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

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
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
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta3 = mini._.$insta3 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt1.loadImage(opt.map1)
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt2.loadImage(opt.map2)

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

        vec4 lut(vec4 color) {
          vec3 texel = color.rgb;
          texel.r = texture(map, vec2(texel.r, 0.5)).r;
          texel.g = texture(map, vec2(texel.g, 0.5)).g;
          texel.b = texture(map, vec2(texel.b, 0.5)).b;
          vec3 desat = vec3(dot(vec3(0.7, 0.2, 0.1), texel));
          texel = mix(texel, desat, 0.79);
          texel = vec3(min(1.0, 1.2 * dot(vec3(0.2, 0.7, 0.1), texel)));
          texel.r = texture(map2, vec2(texel.r, 0.5)).r;
          texel.g = texture(map2, vec2(texel.g, 0.5)).g;
          texel.b = texture(map2, vec2(texel.b, 0.5)).b;
          return vec4(texel, color.a);
        }

        void main() {
          vec4 color = texture(_texture, texCoord);
          outColor = color * (1.0 - filterStrength) + lut(color) * filterStrength;
        }
    `
    mini._.$insta4 = mini._.$insta4 || new Shader(gl, null, _fragment);
    mini._.$instatxt1 = mini._.$instatxt1 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt1.loadImage(opt.map1)
    mini._.$instatxt2 = mini._.$instatxt2 || new Texture(gl, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    mini._.$instatxt2.loadImage(opt.map2)

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
      greeni: [
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


    function splineInterpolate(points) {
        var spline = new Spline(points);
        var curve = [];
        for (var i = 0; i < 256; i++) {
            curve.push(clamp(0, Math.floor(spline.at(i / 255) * 256), 255));
        }
        return curve;
    }

//red,green,blue   arrays [[0,0],...,[1,1]] describing channel curve
export function filterCurves(mini, array) {
  //console.log('filterCurves')
    if(array.every(e=>e===null)) return //console.error('curves: need at least one array')
    if(!array[0]) array[0]=[[0,0],[1,1]] //linear identity curve
    let red=array[1]||array[0];
    let green=array[2]||array[0];
    let blue=array[3]||array[0];
    red = splineInterpolate(red);
    green = splineInterpolate(green);
    blue = splineInterpolate(blue);
    if(red.length!==256 || green.length!==256 || blue.length!==256) return console.error('curves: input unknown')

    var array = [];
    for (var i = 0; i < 256; i++) {
        array.splice(array.length, 0, red[i], green[i], blue[i], 255);
    }    

    const _fragment = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform sampler2D curvemap;

        void main() {
            vec4 color = texture(_texture, texCoord);
            color.r = texture(curvemap, vec2(color.r)).r;
            color.g = texture(curvemap, vec2(color.g)).g;
            color.b = texture(curvemap, vec2(color.b)).b;
            outColor = color;
        }
      `

    const {gl}=mini
    //setup and run effect
    mini._.$curvestexture = mini._.$curvestexture || new Texture(gl);
    mini._.$curvestexture.initFromBytes(256, 1, array);
    mini._.$curvestexture.use(2);
    mini._.$curves = mini._.$curves || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$curves, {curvemap:{unit:2}} )
}



    /**
     * @filter                Matrix Warp
     * @description           Transforms an image by a 2x2 or 3x3 matrix. The coordinates used in
     *                        the transformation are (x, y) for a 2x2 matrix or (x, y, 1) for a
     *                        3x3 matrix, where x and y are in units of pixels.
     * @param matrix          A 2x2 or 3x3 matrix represented as either a list or a list of lists.
     *                        For example, the 3x3 matrix [[2,0,0],[0,3,0],[0,0,1]] can also be
     *                        represented as [2,0,0,0,3,0,0,0,1] or just [2,0,0,3].
     * @param inverse         A boolean value that, when true, applies the inverse transformation
     *                        instead. (optional, defaults to false)
     * @param useTextureSpace A boolean value that, when true, uses texture-space coordinates
     *                        instead of screen-space coordinates. Texture-space coordinates range
     *                        from -1 to 1 instead of 0 to width - 1 or height - 1, and are easier
     *                        to use for simple operations like flipping and rotating.
     */
    function matrixWarp(mini, matrix, inverse, useTextureSpace) {

        const _fragment = `#version 300 es
            precision highp float;

            in vec2 texCoord;
            uniform sampler2D _texture;
            uniform vec2 uResolution;
            uniform mat3 matrix;
            uniform bool useTextureSpace;
            out vec4 outColor;

            void main() {
                vec2 coord = texCoord * uResolution;
                if (useTextureSpace) coord = coord / uResolution * 2.0 - 1.0;
                vec3 warp = matrix * vec3(coord, 1.0);
                coord = warp.xy / warp.z;
                if (useTextureSpace) coord = (coord * 0.5 + 0.5) * uResolution;
                vec4 color = texture(_texture, coord / uResolution);
                vec2 clampedCoord = clamp(coord, vec2(0.0), uResolution);
                if (coord != clampedCoord) {
                    color.a *= max(0.0, 1.0 - length(coord - clampedCoord));
                }
                outColor = color;
            }
          `


        const {gl, img}=mini
        mini._.$warp = mini._.$warp || new Shader(gl, null, _fragment);

        // Flatten all members of matrix into one big list
        matrix = Array.prototype.concat.apply([], matrix);
        // Extract a 3x3 matrix out of the arguments
        if (matrix.length == 4) {
            matrix = [
                matrix[0], matrix[1], 0,
                matrix[2], matrix[3], 0,
                0, 0, 1
            ];
        } else if (matrix.length != 9) {
            throw 'can only warp with 2x2 or 3x3 matrix';
        }
    
        const uResolution = [gl.canvas.width,gl.canvas.height];
        mini.runFilter(mini._.$warp, { 
          matrix: inverse ? getInverse(matrix) : matrix,
          uResolution,
          useTextureSpace: useTextureSpace | 0
        });
    }


export function filterPerspective(mini, before, after, inverse, useTextureSpace ) {

  before=before.flat()
  after=after.flat()
  var a = getSquareToQuad.apply(null, after);
  var b = getSquareToQuad.apply(null, before);
  var c = multiply(getInverse(a), b);
  return matrixWarp(mini, c, inverse, useTextureSpace);
}


///////// UTILITY FUNCTIONS ////////////////////
  function clamp(lo, value, hi) {
      return Math.max(lo, Math.min(value, hi));
  }

  var m3 = {
    projection: function projection(width, height) {
      // Note: This matrix flips the Y axis so that 0 is at the top.
      return [
        2 / width, 0, 0,
        0, 2 / height, 0,
        -1, -1, 1,
      ];
    },

    translation: function translation(tx, ty) {
      return [
        1, 0, 0,
        0, 1, 0,
        tx, ty, 1,
      ];
    },

    rotation: function rotation(angleInRadians) {
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
      return [
        c, -s, 0,
        s, c, 0,
        0, 0, 1,
      ];
    },

    scaling: function scaling(sx, sy) {
      return [
        sx, 0, 0,
        0, sy, 0,
        0, 0, 1,
      ];
    },

    multiply: function multiply(a, b) {
      var a00 = a[0 * 3 + 0];
      var a01 = a[0 * 3 + 1];
      var a02 = a[0 * 3 + 2];
      var a10 = a[1 * 3 + 0];
      var a11 = a[1 * 3 + 1];
      var a12 = a[1 * 3 + 2];
      var a20 = a[2 * 3 + 0];
      var a21 = a[2 * 3 + 1];
      var a22 = a[2 * 3 + 2];
      var b00 = b[0 * 3 + 0];
      var b01 = b[0 * 3 + 1];
      var b02 = b[0 * 3 + 2];
      var b10 = b[1 * 3 + 0];
      var b11 = b[1 * 3 + 1];
      var b12 = b[1 * 3 + 2];
      var b20 = b[2 * 3 + 0];
      var b21 = b[2 * 3 + 1];
      var b22 = b[2 * 3 + 2];
      return [
        b00 * a00 + b01 * a10 + b02 * a20,
        b00 * a01 + b01 * a11 + b02 * a21,
        b00 * a02 + b01 * a12 + b02 * a22,
        b10 * a00 + b11 * a10 + b12 * a20,
        b10 * a01 + b11 * a11 + b12 * a21,
        b10 * a02 + b11 * a12 + b12 * a22,
        b20 * a00 + b21 * a10 + b22 * a20,
        b20 * a01 + b21 * a11 + b22 * a21,
        b20 * a02 + b21 * a12 + b22 * a22,
      ];
    },
  };

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


// from javax.media.jai.PerspectiveTransform
function getSquareToQuad(x0, y0, x1, y1, x2, y2, x3, y3) {
    var dx1 = x1 - x2;
    var dy1 = y1 - y2;
    var dx2 = x3 - x2;
    var dy2 = y3 - y2;
    var dx3 = x0 - x1 + x2 - x3;
    var dy3 = y0 - y1 + y2 - y3;
    var det = dx1*dy2 - dx2*dy1;
    var a = (dx3*dy2 - dx2*dy3) / det;
    var b = (dx1*dy3 - dx3*dy1) / det;
    return [
        x1 - x0 + a*x1, y1 - y0 + a*y1, a,
        x3 - x0 + b*x3, y3 - y0 + b*y3, b,
        x0, y0, 1
    ];
}

function getInverse(m) {
    var a = m[0], b = m[1], c = m[2];
    var d = m[3], e = m[4], f = m[5];
    var g = m[6], h = m[7], i = m[8];
    var det = a*e*i - a*f*h - b*d*i + b*f*g + c*d*h - c*e*g;
    return [
        (e*i - f*h) / det, (c*h - b*i) / det, (b*f - c*e) / det,
        (f*g - d*i) / det, (a*i - c*g) / det, (c*d - a*f) / det,
        (d*h - e*g) / det, (b*g - a*h) / det, (a*e - b*d) / det
    ];
}

function multiply(a, b) {
    return [
        a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
        a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
        a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
        a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
        a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
        a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
        a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
        a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
        a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
    ];
}