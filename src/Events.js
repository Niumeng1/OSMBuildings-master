// gesture polyfill adapted from https://raw.githubusercontent.com/seznam/JAK/master/lib/polyfills/gesturechange.js
// MIT License

/**
 * @private
 */
function add2(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

/**
 * @private
 */
function mul2scalar(a, f) {
  return [a[0]*f, a[1]*f];
}

function getPos(e) {
  var el = e.target;

  if (el.getBoundingClientRect) {
    var box = el.getBoundingClientRect();
    if (box !== undefined) {
      return { x: e.x-box.left, y: e.y-box.top };
    }
  }

  var res = { x: 0, y: 0 };
  while (el.nodeType === 1) {
    res.x += el.offsetLeft;
    res.y += el.offsetTop;
    el = el.parentNode;
  }
  return { x: e.x-res.s, y: e.y-res.y };
}

/**
 * @private
 */
function cancelEvent(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  //if (e.stopPropagation) {
  //  e.stopPropagation();
  //}
  e.returnValue = false;
}

/**
 * @private
 */
function addListener(target, type, fn) {
  target.addEventListener(type, fn, false);
}

/**
 * @private
 */
var Events = {};

/**
 * @private
 */
Events.disabled = false;

/**
 * @private
 */
Events.init = function(container) {

  if ('ontouchstart' in window) {
    addListener(container, 'touchstart', onTouchStart);
    addListener(document, 'touchmove', onTouchMoveDocument);
    addListener(container, 'touchmove', onTouchMove);
    addListener(document, 'touchend', onTouchEnd);
    addListener(document, 'gesturechange', onGestureChange);
  } else {
    addListener(container, 'mousedown', onMouseDown);
    addListener(document, 'mousemove', onMouseMoveDocument);
    addListener(container, 'mousemove', onMouseMove);
    addListener(document, 'mouseup', onMouseUp);
    addListener(container, 'dblclick', onDoubleClick);
    addListener(container, 'mousewheel', onMouseWheel);
    addListener(container, 'DOMMouseScroll', onMouseWheel);
    addListener(container, 'contextmenu', onContextMenu);
  }

  var resizeDebounce;
  addListener(window, 'resize', function() {
    if (resizeDebounce) {
      return;
    }
    resizeDebounce = setTimeout(function() {
      resizeDebounce = null;
      APP.setSize({ width: container.offsetWidth, height: container.offsetHeight });
    }, 250);
  });

  //***************************************************************************

  var
    startX = 0,
    startY = 0,
    prevX = 0,
    prevY = 0,
    startZoom = 0,
    prevRotation = 0,
    prevTilt = 0,
    button = 0;

  function onDoubleClick(e) {
    cancelEvent(e);
    if (!Events.disabled) {
      APP.setZoom(APP.zoom + 1, e);
    }
    var pos = getPos(e);
    APP.emit('doubleclick', { x: pos.x, y: pos.y, button: e.button, buttons: e.buttons });
  }

  function onMouseDown(e) {
    cancelEvent(e);

    startZoom = APP.zoom;
    prevRotation = APP.rotation;
    prevTilt = APP.tilt;

    startX = prevX = e.clientX;
    startY = prevY = e.clientY;

    if ((e.buttons === 1 && e.altKey) || e.buttons === 2) {
      button = 2;
    } else if (e.buttons === 1) {
      button = 1;
    }

    var pos = getPos(e);
    APP.emit('pointerdown', { x: pos.x, y: pos.y, button: e.button, buttons: e.buttons });
  }

  function onMouseMoveDocument(e) {
    if (button === 1) {
      moveMap(e);
    } else if (button === 2) {
      rotateMap(e);
    }

    prevX = e.clientX;
    prevY = e.clientY;
  }

  function onMouseMove(e) {
    APP.emit('pointermove', getPos(e));
  }

  function onMouseUp(e) {
    // prevents clicks on other page elements
    if (!button) {
      return;
    }

    if (button === 1) {
      moveMap(e);
    } else if (button === 2) {
      rotateMap(e);
    }

    button = 0;
    APP.emit('pointerup', { button: e.button, buttons: e.buttons });
  }

  function onMouseWheel(e) {
    cancelEvent(e);

    var delta = 0;
    if (e.wheelDeltaY) {
      delta = e.wheelDeltaY;
    } else if (e.wheelDelta) {
      delta = e.wheelDelta;
    } else if (e.detail) {
      delta = -e.detail;
    }

    if (!Events.disabled) {
      var adjust = 0.2*(delta>0 ? 1 : delta<0 ? -1 : 0);
      APP.setZoom(APP.zoom + adjust, e);
    }

    // we don't emit mousewheel here as we don't want to run into a loop of death
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  //***************************************************************************

  function moveMap(e) {
    if (Events.disabled) {
      return;
    }

    // FIXME: make movement exact
    // the constant 0.86 was chosen experimentally for the map movement to be
    // "pinned" to the cursor movement when the map is shown top-down
    var
      scale = 0.86*Math.pow(2, -APP.zoom),
      lonScale = 1/Math.cos(APP.position.latitude/180*Math.PI),
      dx = e.clientX - prevX,
      dy = e.clientY - prevY,
      angle = APP.rotation*Math.PI/180,
      vRight = [Math.cos(angle), Math.sin(angle)],
      vForward = [Math.cos(angle - Math.PI/2), Math.sin(angle - Math.PI/2)],
      dir = add2(mul2scalar(vRight, dx), mul2scalar(vForward, -dy));

    var newPosition = {
      longitude: APP.position.longitude - dir[0]*scale*lonScale,
      latitude: APP.position.latitude + dir[1]*scale
    };

    APP.setPosition(newPosition);
    APP.emit('move', newPosition);
  }

  function rotateMap(e) {
    if (Events.disabled) {
      return;
    }
    prevRotation += (e.clientX - prevX)*(360/innerWidth);
    prevTilt -= (e.clientY - prevY)*(360/innerHeight);
    APP.setRotation(prevRotation);
    APP.setTilt(prevTilt);
  }

  //***************************************************************************

  var
    dist1 = 0,
    angle1 = 0,
    gestureStarted = false;

  function emitGestureChange(e) {
    var
      t1 = e.touches[0],
      t2 = e.touches[1],
      dx = t1.clientX - t2.clientX,
      dy = t1.clientY - t2.clientY,
      dist2 = dx*dx + dy*dy,
      angle2 = Math.atan2(dy, dx);

    onGestureChange({ rotation: ((angle2 - angle1)*(180/Math.PI))%360, scale: Math.sqrt(dist2/dist1) });
  }

  function onTouchStart(e) {
    button = 1;
    cancelEvent(e);

    var t1 = e.touches[0];

    // gesturechange polyfill
    if (e.touches.length === 2 && !('ongesturechange' in window)) {
      var t2 = e.touches[1];
      var dx = t1.clientX - t2.clientX;
      var dy = t1.clientY - t2.clientY;
      dist1 = dx*dx + dy*dy;
      angle1 = Math.atan2(dy, dx);
      gestureStarted = true;
    }

    startZoom = APP.zoom;
    prevRotation = APP.rotation;
    prevTilt = APP.tilt;

    startX = prevX = t1.clientX;
    startY = prevY = t1.clientY;

    APP.emit('pointerdown', { x: e.x, y: e.y, button: 0, buttons: 1 });
  }

  function onTouchMoveDocument(e) {
    if (!button) {
      return;
    }

    var t1 = e.touches[0];

    if (e.touches.length>1) {
      APP.setTilt(prevTilt + (prevY - t1.clientY)*(360/innerHeight));
      prevTilt = APP.tilt;
      // gesturechange polyfill
      if (!('ongesturechange' in window)) {
        emitGestureChange(e);
      }
    } else {
      moveMap(t1);
    }
    prevX = t1.clientX;
    prevY = t1.clientY;
  }

  function onTouchMove(e) {
    if (e.touches.length === 1) {
      var pos = getPos(e.touches[0]);
      APP.emit('pointermove', { x: pos.x, y: pos.y, button: 0, buttons: 1 });
    }
  }

  function onTouchEnd(e) {
    if (!button) {
      return;
    }

    // gesturechange polyfill
    gestureStarted = false;

    var t1 = e.touches[0];

    if (e.touches.length === 0) {
      button = 0;
      APP.emit('pointerup', { button: 0, buttons: 1 });
    } else if (e.touches.length === 1) {
      // There is one touch currently on the surface => gesture ended. Prepare for continued single touch move
      prevX = t1.clientX;
      prevY = t1.clientY;
    }
  }

  function onGestureChange(e) {
    if (!button) {
      return;
    }

    cancelEvent(e);

    if (!Events.disabled) {
      APP.setZoom(startZoom + (e.scale - 1));
      APP.setRotation(prevRotation - e.rotation);
    }

    APP.emit('gesture', e);
  }
};
