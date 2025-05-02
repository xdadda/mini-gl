import { Shader, Texture } from '../minigl.js'

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

  //check if canvas is rotated using mini.height, as it's updated in case of crop or resize
  if(gl.canvas.width===mini.height){ 
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
