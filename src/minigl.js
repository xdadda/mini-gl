/* 
*  HEAVILY MODIFIED VERSION of glfx.js by Evan Wallace 
*  https://evanw.github.io/glfx.js/
*/

import * as Filters from './minigl_filters.js'

export {Spline} from './cubicspline.js'

export function minigl(canvas,img,colorspace) {
  let gl = canvas.getContext("webgl2",{ antialias:false, premultipliedAlpha: true, })
  if (!gl) return console.error("webgl2 not supported!")
  if(colorspace==="display-p3") {
    gl.drawingBufferColorSpace = "display-p3";
    gl.unpackColorSpace = "display-p3";        
  }

  //update canvas size to image for full resolution. Use style to change visible sizes
  gl.canvas.width=img.width
  gl.canvas.height=img.height
 
  //create IMAGE TEXTURE && load image
  const imageTexture = new Texture(gl)
  imageTexture.loadImage(img)
  //imageTexture.label='imageTXT'
  //create default SHADER
  const defaultShader = new Shader(gl)
  const flippedShader = new Shader(gl,null,flippedFragmentSource)
  
  //create two effects' blank textures to handle [image-->shaderA-->txt1-->shaderB-->txt2-->canvas]
  //note: setupFiltersTextures needs to be re-run if canvas width/height change (eg when changing aspect ratio)
  let textures, count=0;
  function setupFiltersTextures(){
    if(textures?.length) textures.forEach(e=>e.destroy())
    textures=[]
    for (var ii = 0; ii < 2; ++ii) {
      // make the blank texture the same size as the image
      const texture = new Texture(gl,gl.canvas.width, gl.canvas.height);
      textures.push(texture);
    }
  }
  setupFiltersTextures()

  function destroy(){
    if(textures?.length) textures.forEach(e=>e.destroy())
    if(croppedTexture) croppedTexture.destroy()
    imageTexture.destroy()
    delete minigl.img_cropped
  }

  let current_texture
  function runFilter(shader, uniforms){
    if(uniforms) shader.uniforms(uniforms)
    //console.log('runFilter',current_texture.label)
    if(current_texture) current_texture.use()
    textures[count%2].drawTo()
    shader.drawRect()
    current_texture=textures[count%2]
    count++
  }

  function loadImage(){
    if(croppedTexture) current_texture= croppedTexture
    else current_texture=imageTexture
    runFilter(defaultShader,null)
  }

  function paintCanvas(){
    if(current_texture) current_texture.use()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null) //draw to canvas
    flippedShader.drawRect()
  }

  
  let croppedTexture
  function crop({left, top, width, height}){ 
      //FIX FOR SAFARI & display-p3 bug (a direct GL->2D drawImage loses colorspace ... this is a workaround)
      runFilter(defaultShader,{})

      const length = width * height * 4;
      const data = new Uint8Array(length);
      gl.readPixels(left,top,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
      const colorspace=gl.unpackColorSpace
      const imgdata_cropped = new ImageData(new Uint8ClampedArray(data.buffer), width, height, { colorSpace: colorspace})

      croppedTexture = new Texture(gl)
      croppedTexture.loadImage(imgdata_cropped)
      gl.canvas.width=width
      gl.canvas.height=height
      setupFiltersTextures()
      minigl.img_cropped = imagedata_to_image(imgdata_cropped,colorspace)
  }
  
  function resetCrop(){
    if(!croppedTexture) return
    croppedTexture.destroy()
    croppedTexture=null
    gl.canvas.width=img.width
    gl.canvas.height=img.height
    delete minigl.img_cropped
    setupFiltersTextures()
  }

  //type: String - indicating the image format. The default type is image/png
  //quality: Number - between 0 and 1 indicating the image quality to be used with lossy compression
  //returns Image
  function captureImage(type, quality){
      runFilter(defaultShader,{})
      const {width,height}=gl.canvas
      const length = width * height * 4;
      const data = new Uint8Array(length);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
      //note: data.buffer contains raw pixel ArrayBuffer (for future reference to feed an image compressor)
      const colorspace=gl.unpackColorSpace
      const imgdata = new ImageData(new Uint8ClampedArray(data.buffer), width, height, { colorSpace: colorspace})
      return imagedata_to_image(imgdata, colorspace, type,quality)
  }

  const minigl= {
    gl,
    img,
    destroy,
    loadImage,
    paintCanvas,
    crop,
    resetCrop,
    captureImage,
    runFilter,
    setupFiltersTextures,
    _:{} //for filters' storage
   }

  //load all filters
  function wrap(fn){
    return function(...args){fn(minigl,...args)}
  }
  Object.keys(Filters).forEach(f=>minigl[f]=wrap(Filters[f]))

  return minigl
}

const flippedFragmentSource = `#version 300 es
        precision highp float;
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;
        void main() {
            outColor = texture(_texture, vec2(texCoord.x, 1.0 - texCoord.y));
        }`


export function Shader(gl,vertexSrc,fragmentSrc) {

      const defaultVertexSource = `#version 300 es
        in vec2 vertex;
        out vec2 texCoord;

        void main() {
          texCoord = vertex;
          gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);
        }
      `;

      const defaultFragmentSource = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;   

        void main() {
          outColor = texture(_texture, texCoord);
        }
      `;


    const program = gl.createProgram()
    let vertex
    gl.attachShader(program,compileSource(gl, gl.VERTEX_SHADER, vertexSrc||defaultVertexSource))
    gl.attachShader(program,compileSource(gl, gl.FRAGMENT_SHADER,fragmentSrc|| defaultFragmentSource))
    gl.linkProgram(program)
    

    function drawRect(refresh=true, left, top, right, bottom){
          //get the current viewport
          const viewport = gl.getParameter(gl.VIEWPORT);
          left = left !== undefined ? (left - viewport[0]) / viewport[2] : 0;
          top = top !== undefined ? (top - viewport[1]) / viewport[3] : 0;
          right = right !== undefined ? (right - viewport[0]) / viewport[2] : 1;
          bottom = bottom !== undefined ? (bottom - viewport[1]) / viewport[3] : 1;

      //prepare vertex
      gl.useProgram(program)
      gl.vertexBuffer = gl.vertexBuffer || gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer)
      //1 unit wad
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([ left, top, left, bottom, right, top, right, bottom ]),
        //new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]),
        gl.STATIC_DRAW
      )
      if(!vertex) {
        vertex = gl.getAttribLocation(program, "vertex")
        gl.enableVertexAttribArray(vertex)
      }
      gl.vertexAttribPointer(vertex, 2, gl.FLOAT, false, 0, 0)

      //convert from clip space to pixel space
      //gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
      //clear canvas
      if(refresh){
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.GL_DEPTH_BUFFER_BIT);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    
    function uniforms(uni={}){
      gl.useProgram(program);
      for (let name in uni) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) continue; // will be null if the uniform isn't used in the shader
        let value = uni[name];
        if (Array.isArray(value)) {
          switch (value.length) {
            case 1: {
              if(Array.isArray(value[0])) value=value[0] //to load uniform float array[9]
              gl.uniform1fv(location, new Float32Array(value)); break;
            }
            case 2: gl.uniform2fv(location, new Float32Array(value)); break;
            case 3: gl.uniform3fv(location, new Float32Array(value)); break;
            case 4: gl.uniform4fv(location, new Float32Array(value)); break;
            case 9: gl.uniformMatrix3fv(location, false, new Float32Array(value)); break;
            case 16: gl.uniformMatrix4fv(location, false, new Float32Array(value)); break;
            default: throw 'dont\'t know how to load uniform "' + name + '" of length ' + value.length;
          }
        } 
        else if (value?.unit) { // {unit:1} ... it's a texture loaded in slot unit
          gl.uniform1i(location, value.unit);
        }
        else if (typeof value === 'number') {
          gl.uniform1f(location, value);
        } 
        else {
          throw 'attempted to set uniform "' + name + '" to invalid value ' + (value || 'undefined').toString();
        }       
      }
    }
    
    function compileSource(gl, type, source) {
      var shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw "compile error: " + gl.getShaderInfoLog(shader)
      }
      return shader
    }


    return {drawRect, uniforms}
}

export function Texture(gl, width, height) {
    let _width=width, _height=height
    let txt = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, txt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    //if size provided, create blank texture
    if (width && height) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    function use(unit=0){
      if(!txt) return console.error('texture has been destroyed')
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, txt)
    }
    function destroy(){
      gl.deleteTexture(txt);
      txt=null
    }
    function drawTo(){
      if(!txt) return console.error('texture has been destroyed')
      // create/ reuse a framebuffer
      gl.framebuffer = gl.framebuffer || gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, gl.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, txt, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('incomplete framebuffer');
      }
      //sets the conversion from normalized device coordinates/ clip space to pixel space
      gl.viewport(0,0,_width,_height)
    }
    function loadImage(img){
      if(!txt) return console.error('texture has been destroyed')
      _width=img.width
      _height=img.height
      gl.bindTexture(gl.TEXTURE_2D, txt)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    }
    function initFromBytes(width, height, data) {
      _width=width
      _height=height
      gl.bindTexture(gl.TEXTURE_2D, txt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));
    };
    
    return {use, destroy, drawTo, loadImage, initFromBytes}
}

function imagedata_to_image(imagedata, colorspace, type, quality) {
    const canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d',{ colorSpace: colorspace });
    canvas.width = imagedata.width;
    canvas.height = imagedata.height;
    ctx.putImageData(imagedata, 0, 0);

    var image = new Image();
    image.src = canvas.toDataURL(type, quality);
    return image;
}




