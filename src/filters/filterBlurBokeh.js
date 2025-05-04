import { Shader, Texture } from '../minigl.js'

export function filterBlurBokeh(mini, params) {
    const _fragment = `#version 300 es
        //Bokeh disc. by David Hoskins.
        //https://www.shadertoy.com/view/4d2Xzw
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform float bokehstrength;
        uniform float bokehlensin;
        uniform float bokehlensout;
        uniform float centerX;
        uniform float centerY;

        #define GOLDEN_ANGLE 2.39996323
        #define ITERATIONS 512
        const mat2 rot = mat2(cos(GOLDEN_ANGLE), sin(GOLDEN_ANGLE), -sin(GOLDEN_ANGLE), cos(GOLDEN_ANGLE));
        vec3 Bokeh(sampler2D tex, vec2 uv, float radius)
        {
          vec3 acc = vec3(0), div = acc;
            float r = 1.;
            vec2 vangle = vec2(0.0,radius*.01 / sqrt(float(ITERATIONS)));
            
          for (int j = 0; j < ITERATIONS; j++)
            {  
                // the approx increase in the scale of sqrt(0, 1, 2, 3...)
                r += 1. / r;
              vangle = rot * vangle;
                vec3 col = texture(tex, uv + (r-1.) * vangle).xyz; /// ... Sample the image
                //col = col * col *1.8; // ... Contrast it for better highlights - leave this out elsewhere.
            vec3 bokeh = pow(col, vec3(4));
            acc += col * bokeh;
            div += bokeh;
          }
          return acc / div;
        }


        void main() {
            vec4 color = texture(_texture, texCoord);
            vec4 bcolor = vec4(Bokeh(_texture, texCoord, bokehstrength), 1.);
    
            //vignette used to control alpha
            vec2 lensRadius = vec2(bokehlensout, bokehlensin);
            float dist = distance(texCoord.xy, vec2(centerX,centerY));
            float vigfin = pow(1.-smoothstep(lensRadius.x, lensRadius.y, dist),2.);

            outColor = mix( color, bcolor, vigfin);
        }
      `

    const {gl}=mini
    let { bokehstrength=0.5, bokehlensin=0, bokehlensout=0.5, centerX=0, centerY=0} = params ||{}
    //setup and run effect
    mini._.$circleblur = mini._.$circleblur || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$circleblur, {bokehstrength,bokehlensin,bokehlensout,centerX,centerY} )
}