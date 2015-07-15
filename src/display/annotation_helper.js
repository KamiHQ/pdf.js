/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals PDFJS, Util, AnnotationType, AnnotationBorderStyleType, warn,
           CustomStyle, isArray */

'use strict';

var ANNOT_MIN_SIZE = 10; // px

var AnnotationUtils = (function AnnotationUtilsClosure() {
  // TODO(mack): This dupes some of the logic in CanvasGraphics.setFont()
  function setTextStyles(element, item, fontObj) {

    var style = element.style;

    if ('fontSize' in item) {
      style.fontSize = item.fontSize + 'px';
    }

    style.direction = item.fontDirection < 0 ? 'rtl': 'ltr';

    if (!fontObj) {
      return;
    }

    style.fontWeight = fontObj.black ?
      (fontObj.bold ? 'bolder' : 'bold') :
      (fontObj.bold ? 'bold' : 'normal');
    style.fontStyle = fontObj.italic ? 'italic' : 'normal';

    var fontName = fontObj.loadedName;
    var fontFamily = fontName ? '"' + fontName + '", ' : '';
    // Use a reasonable default font if the font doesn't specify a fallback
    var fallbackName = fontObj.fallbackName || 'Helvetica, sans-serif';
    style.fontFamily = fontFamily + fallbackName;
  }

  function initContainer(item, drawBorder) {
    var container = document.createElement('section');
    var cstyle = container.style;
    var width = item.rect[2] - item.rect[0];
    var height = item.rect[3] - item.rect[1];

    // Border
    if (item.borderStyle.width > 0) {
      // Border width
      container.style.borderWidth = item.borderStyle.width + 'px';
      if (item.borderStyle.style !== AnnotationBorderStyleType.UNDERLINE) {
        // Underline styles only have a bottom border, so we do not need
        // to adjust for all borders. This yields a similar result as
        // Adobe Acrobat/Reader.
        width = width - 2 * item.borderStyle.width;
        height = height - 2 * item.borderStyle.width;
      }

      // Horizontal and vertical border radius
      var horizontalRadius = item.borderStyle.horizontalCornerRadius;
      var verticalRadius = item.borderStyle.verticalCornerRadius;
      if (horizontalRadius > 0 || verticalRadius > 0) {
        var radius = horizontalRadius + 'px / ' + verticalRadius + 'px';
        CustomStyle.setProp('borderRadius', container, radius);
      }

      // Border style
      switch (item.borderStyle.style) {
        case AnnotationBorderStyleType.SOLID:
          container.style.borderStyle = 'solid';
          break;

        case AnnotationBorderStyleType.DASHED:
          container.style.borderStyle = 'dashed';
          break;

        case AnnotationBorderStyleType.BEVELED:
          warn('Unimplemented border style: beveled');
          break;

        case AnnotationBorderStyleType.INSET:
          warn('Unimplemented border style: inset');
          break;

        case AnnotationBorderStyleType.UNDERLINE:
          container.style.borderBottomStyle = 'solid';
          break;

        default:
          break;
      }

      // Border color
      if (item.color) {
        container.style.borderColor =
          Util.makeCssRgb(Math.round(item.color[0] * 255),
                          Math.round(item.color[1] * 255),
                          Math.round(item.color[2] * 255));
      } else {
        // Default color is black, but that's not obvious from the spec.
        container.style.borderColor = 'rgb(0,0,0)';
      }
    }

    cstyle.width = width + 'px';
    cstyle.height = height + 'px';
    return container;
  }

  function isBitSet(value, pos) {
    // Note: pos is 1 based index
    return !!(value & (1 << (pos - 1)));
  }

  function createWidgetAnnotationContainer(item) {
    var element = document.createElement('div');
    var width = item.rect[2] - item.rect[0];
    var height = item.rect[3] - item.rect[1];
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    element.className = 'widgetContainer';

    return element;
  }

  function createTextWidgetAnnotation(item, commonObjs) {
    var isMultiline = isBitSet(item.fieldFlags, 13);
    // var isPassword = isBitSet(item.fieldFlags, 14);
    // var isFileSelect = isBitSet(item.fieldFlags, 21);
    // var isDoNotSpellCheck = isBitSet(item.fieldFlags, 23);
    // var isDoNotScroll = isBitSet(item.fieldFlags, 24);
    // var isComb = isBitSet(item.fieldFlags, 25);
    // var isRichText = isBitSet(item.fieldFlags, 26);

    var content;

    if (isMultiline) {
      content = document.createElement('textarea');
    } else {
      content = document.createElement('input');
      content.type = 'text';
    }
    
    content.value = item.fieldValue;
    var textAlignment = item.textAlignment;
    content.style.textAlign = ['left', 'center', 'right'][textAlignment];
    content.style.verticalAlign = 'middle';
    content.className = 'widgetControl';
    if (item.maxLen !== null) {
      content.maxLength = item.maxLen;
    }

    var fontObj = item.fontRefName ?
      commonObjs.getData(item.fontRefName) : null;
    setTextStyles(content, item, fontObj);

    if (!isMultiline && !('fontSize' in item)) {
      // hack to guess font size base on content hight
      // so it display fine on small text field
      // this need to be removed when we can apply defaultAppearance
      var height = item.rect[3] - item.rect[1];
      if (height < 15) {
          content.style.fontSize = (height - 1) + 'px';
      }
    }

    return content;
  }

  function createChoiceWidgetAnnotation(item, commonObjs) {
    var isCombo = isBitSet(item.fieldFlags, 18);
    // var isEdit = isBitSet(item.fieldFlags, 19);
    var isMultiSelect = isBitSet(item.fieldFlags, 22);
    // var isDoNotSpellCheck = isBitSet(item.fieldFlags, 23);
    // var isCommitOnSelChange = isBitSet(item.fieldFlags, 27);

    var content = document.createElement('select');
    content.className = 'widgetControl';

    if (!isCombo) { // list box
      // size should be calcualted from content.style.height / rowHeight
      // but because we already set content.style.height so 2 is enough
      content.size = 2;
    }

    content.multiple = isMultiSelect;

    var i, ii;
    for (i = 0, ii = item.options.length; i < ii; i++) {
      var optionElement = document.createElement('option');
      var option = item.options[i];
      if (isArray(option)) {
        optionElement.value = option[0];
        optionElement.text = option[1];
      } else {
        optionElement.text = option;
      }

      if (optionElement.text === item.fieldValue) {
        optionElement.selected = true;
      }
      
      content.appendChild(optionElement);
    }

    return content;
  }

  function createButtonWidgetAnnotation(item, commonObjs) {
    // var isNoToggleToOff = isBitSet(item.fieldFlags, 15);
    var isRadio = isBitSet(item.fieldFlags, 16);
    var isPushbutton = isBitSet(item.fieldFlags, 17);
    // var isRadiosInUnison = isBitSet(item.fieldFlags, 26);

    var content;
    if (isPushbutton) {
      return; // not supported
      // content = document.createElement('button');
    } else {

      var input = document.createElement('input');
      if (isRadio) {
        input.type = 'radio';
      } else {
        input.type = 'checkbox';
      }

      content = document.createElement('label');
      content.appendChild(input);
      var span = document.createElement('span');
      content.appendChild(span);

      input.checked = item.fieldValue.length && item.fieldValue.toUpperCase() !== 'OFF';

      // hack to guess font size base on content hight
      // so it display fine on small text field
      // this need to be removed when we can apply defaultAppearance
      var height = item.rect[3] - item.rect[1];
      content.style.fontSize = (height - 1) + 'px';

    }

    
    content.className = 'widgetControl';

    return content;
  }

  function getHtmlElementForInteractiveWidgetAnnotation(item, commonObjs) {
    var element, container;
    switch(item.fieldType) {
      case 'Tx':
        element = createTextWidgetAnnotation(item, commonObjs);
        break;
      case 'Ch':
        element = createChoiceWidgetAnnotation(item, commonObjs);
        break;
      case 'Btn':
        element = createButtonWidgetAnnotation(item, commonObjs);
          break;
    }

    if (element) {
      container = createWidgetAnnotationContainer(item);
      var isReadonly = isBitSet(item.fieldFlags, 1);
      element.disabled = isReadonly;

      element.style.width = container.style.width;
      element.style.height = container.style.height;

      container.appendChild(element);

      return container;
    }

    return null;
  }

  function getHtmlElementForTextWidgetAnnotation(item, commonObjs) {
    var element = document.createElement('div');
    var width = item.rect[2] - item.rect[0];
    var height = item.rect[3] - item.rect[1];
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    element.style.display = 'table';

    var content = document.createElement('div');
    content.textContent = item.fieldValue;
    var textAlignment = item.textAlignment;
    content.style.textAlign = ['left', 'center', 'right'][textAlignment];
    content.style.verticalAlign = 'middle';
    content.style.display = 'table-cell';

    var fontObj = item.fontRefName ?
      commonObjs.getData(item.fontRefName) : null;
    setTextStyles(content, item, fontObj);

    element.appendChild(content);

    return element;
  }

  function getHtmlElementForTextAnnotation(item) {
    var rect = item.rect;

    // sanity check because of OOo-generated PDFs
    if ((rect[3] - rect[1]) < ANNOT_MIN_SIZE) {
      rect[3] = rect[1] + ANNOT_MIN_SIZE;
    }
    if ((rect[2] - rect[0]) < ANNOT_MIN_SIZE) {
      rect[2] = rect[0] + (rect[3] - rect[1]); // make it square
    }

    var container = initContainer(item, false);
    container.className = 'annotText';

    var image  = document.createElement('img');
    image.style.height = container.style.height;
    image.style.width = container.style.width;
    var iconName = item.name;
    image.src = PDFJS.imageResourcesPath + 'annotation-' +
      iconName.toLowerCase() + '.svg';
    image.alt = '[{{type}} Annotation]';
    image.dataset.l10nId = 'text_annotation_type';
    image.dataset.l10nArgs = JSON.stringify({type: iconName});

    var contentWrapper = document.createElement('div');
    contentWrapper.className = 'annotTextContentWrapper';
    contentWrapper.style.left = Math.floor(rect[2] - rect[0] + 5) + 'px';
    contentWrapper.style.top = '-10px';

    var content = document.createElement('div');
    content.className = 'annotTextContent';
    content.setAttribute('hidden', true);

    var i, ii;
    if (item.hasBgColor) {
      var color = item.color;

      // Enlighten the color (70%)
      var BACKGROUND_ENLIGHT = 0.7;
      var r = BACKGROUND_ENLIGHT * (1.0 - color[0]) + color[0];
      var g = BACKGROUND_ENLIGHT * (1.0 - color[1]) + color[1];
      var b = BACKGROUND_ENLIGHT * (1.0 - color[2]) + color[2];
      content.style.backgroundColor = Util.makeCssRgb((r * 255) | 0,
                                                      (g * 255) | 0,
                                                      (b * 255) | 0);
    }

    var title = document.createElement('h1');
    var text = document.createElement('p');
    title.textContent = item.title;

    if (!item.content && !item.title) {
      content.setAttribute('hidden', true);
    } else {
      var e = document.createElement('span');
      var lines = item.content.split(/(?:\r\n?|\n)/);
      for (i = 0, ii = lines.length; i < ii; ++i) {
        var line = lines[i];
        e.appendChild(document.createTextNode(line));
        if (i < (ii - 1)) {
          e.appendChild(document.createElement('br'));
        }
      }
      text.appendChild(e);

      var pinned = false;

      var showAnnotation = function showAnnotation(pin) {
        if (pin) {
          pinned = true;
        }
        if (content.hasAttribute('hidden')) {
          container.style.zIndex += 1;
          content.removeAttribute('hidden');
        }
      };

      var hideAnnotation = function hideAnnotation(unpin) {
        if (unpin) {
          pinned = false;
        }
        if (!content.hasAttribute('hidden') && !pinned) {
          container.style.zIndex -= 1;
          content.setAttribute('hidden', true);
        }
      };

      var toggleAnnotation = function toggleAnnotation() {
        if (pinned) {
          hideAnnotation(true);
        } else {
          showAnnotation(true);
        }
      };

      image.addEventListener('click', function image_clickHandler() {
        toggleAnnotation();
      }, false);
      image.addEventListener('mouseover', function image_mouseOverHandler() {
        showAnnotation();
      }, false);
      image.addEventListener('mouseout', function image_mouseOutHandler() {
        hideAnnotation();
      }, false);

      content.addEventListener('click', function content_clickHandler() {
        hideAnnotation(true);
      }, false);
    }

    content.appendChild(title);
    content.appendChild(text);
    contentWrapper.appendChild(content);
    container.appendChild(image);
    container.appendChild(contentWrapper);

    return container;
  }

  function getHtmlElementForLinkAnnotation(item) {
    var container = initContainer(item, true);
    container.className = 'annotLink';

    var link = document.createElement('a');
    link.href = link.title = item.url || '';
    if (item.url && PDFJS.openExternalLinksInNewWindow) {
      link.target = '_blank';
    }

    container.appendChild(link);

    return container;
  }

  function getHtmlElement(data, objs) {
    if (!data.hasHtml) {
      return null;
    }
    switch (data.annotationType) {
      case AnnotationType.WIDGET:
        return getHtmlElementForTextWidgetAnnotation(data, objs);
      case AnnotationType.TEXT:
        return getHtmlElementForTextAnnotation(data);
      case AnnotationType.LINK:
        return getHtmlElementForLinkAnnotation(data);
      default:
        throw new Error('Unsupported annotationType: ' + data.annotationType);
    }
  }

  function getInteractiveHtmlElement(data, objs) {
    switch (data.annotationType) {
      case AnnotationType.WIDGET:
        return getHtmlElementForInteractiveWidgetAnnotation(data, objs);
      default:
        return getHtmlElement(data, objs);
    }
  }

  return {
    getHtmlElement: getHtmlElement,
    getInteractiveHtmlElement: getInteractiveHtmlElement
  };
})();
PDFJS.AnnotationUtils = AnnotationUtils;
