# mini-gl 
A small webgl2 library to edit images and apply filters. 
 
Inspired and partially based on [glfx.js](https://github.com/evanw/glfx.js) by Evan Wallace 
 
Note: the library adopts a sRGB correct workflow. Keep in mind if adding new shaders/ filters.
 
Demo https://mini2-photo-editor.netlify.app 
(src https://github.com/xdadda/mini-photo-editor)
 
 
 
## Setup 
 
Install:
`npm i @xdadda/mini-gl`
 
 
Import in js:
```js
import { minigl} from '@xdadda/mini-gl'
```
 
 
## Constructor 

```js
      const _wgl = minigl(canvas,image,colorspace)
```
* `canvas`: is the destination [HTMLCanvasElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement) on which minigl will render the image
* `image`: is the source [HTMLImageElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElemen) with the original image
* `colorspace`: specifies the color space of the rendering context ('srg'|'display-p3'); the image's colorspace can be extracted from the file's ICC profile metadata ([@xdadda/mini-exif](https://github.com/xdadda/mini-exif))


## Render chain

1. Load original image texture in memory
```js
      _wgl.loadimage()
```

2. Apply filters (one or more as required)
```js
      // TRANSLATE/ROTATE/SCALE filter
      // input: {translateX:0,translateY:0,angle:0,scale:0,flipv:0,fliph:0}
      // where scale:0 is 1:1 scale
      _wgl.filterMatrix({translateX:0,translateY:0,angle:0,scale:0,flipv:0,fliph:0})

      // BASIC ADJUSTMENTS filter
      // input: {brightness:0, clarity:0, contrast:0, exposure:0, gamma:0, gray:0, 
      //        saturation:0, sepia:0, temperature:0, tint:0, vibrance:0, vignette:0}
      _wgl.filterAdjustments({...})

      // BLOOM filter
      // input: strength
      _wgl.filterBloom(0.5)

      // NOISE filter
      // input: strength
      _wgl.filterNoise(0.5)

      // HIGHLIGHTS & SHADOWS filter
      // input: highlights_strength, shadows_strength
      _wgl.filterHighlightsShadows(0.2,0.3)

      // CURVES filter
      // input: Array of 'curves' for RGB/Luminance, RED, GREEN, BLUE
      // where a 'curve' is an array of points (x,y) across which a spline is interpolated
      // (x,y) represent the value mapping, from x to y
      // a 'curve' can be null to signify a linear interpolation
      // linear input example: [ [[0,0],[0.25,0.25],[0.75,0.75],[1,1]], [...], null, null ]
      _wgl.filterCurves([ [...], [...], [...], [...] ])
```

3. Draw to canvas
```js
      _wgl.paintCanvas()
```

## Other functions

Destroy textures and clear memory:  
```js
_wgl.destroy()
```

Generate an Image element from the current render:  
```js
_wgl.captureImage()
```

Crop image:  
```js
_wgl.crop({left, top, width, height})
```

Clear crop and restore original image:  
```js
_wgl.resetCrop()
```

