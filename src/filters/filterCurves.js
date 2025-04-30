import { Shader, Texture } from '../minigl.js'
import { Spline } from './cubicspline.js'

    function splineInterpolate(points) {
        var spline = new Spline(points);
        var curve = [];
        for (var i = 0; i < 256; i++) {
            curve.push(clamp(0, Math.floor(spline.at(i / 255) * 256), 255));
        }
        return curve;
    }

    function clamp(lo, value, hi) {
        return Math.max(lo, Math.min(value, hi));
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
    mini._.$curvestexture.initFromBytes(256, 1, array, gl.RGBA); //otherwise artifacts will be introduced
    mini._.$curvestexture.use(2);
    mini._.$curves = mini._.$curves || new Shader(gl, null, _fragment);
    mini.runFilter(mini._.$curves, {curvemap:{unit:2}} )
}