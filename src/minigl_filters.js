import { Shader, Texture } from './minigl.js'

export { filterMatrix } from './filters/filterMatrix.js'
export { filterInsta } from './filters/filterInsta.js'
export { filterCurves } from './filters/filterCurves.js'
export { filterPerspective } from './filters/filterPerspective.js'
export { filterBlend } from './filters/filterBlend.js'
export { filterBlurBokeh } from './filters/filterBlurBokeh.js'


export function filterAdjustments(mini, effects) {
      //from https://pqina.nl/pintura/
      //from https://tsev.dev/posts/2020-06-19-colour-correction-with-webgl/
      //from https://api.pixijs.io/@pixi/filter-color-matrix/src/ColorMatrixFilter.ts.html

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
          #define inner .20
          #define outer 1.1
          #define curvature .65
          vec2 curve = pow(abs(pos),vec2(1./curvature));
          float edge = pow(length(curve),curvature);
          float scale = 1.-abs(upos.x);
          float vignette = 1.-v*smoothstep(inner*scale,outer*scale,edge);
          vec4 color = vec4(c.rgb *= vignette , c.a);
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

      const {gl} = mini

      let vignpos = [0,0]
      let {brightness: b=0, contrast: c=0, saturation: s=0, exposure: e=0, temperature: t=0, gamma=0, clarity: l=0, vibrance=0, vignette=0, tint:tt=0, sepia:sp=0} = effects
      //some params adjustments to fit shader and user experience
      b=b/4;c=(c+1)/2+0.5;s=s+1;e=((e>0?e*3:e*1.5)+1)/2+0.5;gamma+=1;t*=2,tt*=2;
      
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
        /*
        //same as saturation!
        gray: [
          [1-.7874*g,.7152*g,.0722*g,0,0],
          [.2126*g,1-.2848*g,.0722*g,0,0],
          [.2126*g,.7152*g,1-.9278*g,0,0],
          [0,0,0,1,0],
        ],
        */
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
      const uTextureSize = [gl.canvas.width,gl.canvas.height]; //[width,height];
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
    mini.runFilter(mini._.$sg, { highlights:val1+1, shadows: val2/2+1 } )
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
    const {gl}=mini
    const uResolution = [gl.canvas.width,gl.canvas.height]; //[width,height];
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
    const {gl}=mini
    const uResolution = [gl.canvas.width,gl.canvas.height];// [width,height];
    mini._.$noise = mini._.$noise || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$noise, { filterStrength: val, uResolution });
}



///////// UTILITY FUNCTIONS ////////////////////

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
