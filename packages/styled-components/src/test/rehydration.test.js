// @flow
import React from 'react';
import TestRenderer from 'react-test-renderer';

import { resetStyled, expectCSSMatches, seedNextClassnames } from './utils';
import createGlobalStyle from '../constructors/createGlobalStyle';
import keyframes from '../constructors/keyframes';
import { masterSheet } from '../models/StyleSheetManager';
import { rehydrateSheet } from '../sheet/Rehydration';
import { SC_ATTR, SC_ATTR_VERSION } from '../constants';

/* NOTE:
   Sometimes we add an empty function interpolation into some
   styled-components to skip the static optimisation in
   ComponentStyle. This will look like this:
   ${() => ''}
   */

const getStyleTags = () =>
  Array.from(document.querySelectorAll('style')).map(el => ({
    css: el.innerHTML.trim().replace(/\s+/gm, ' '),
  }));

let styled;

const resetSheet = sheet => {
  sheet.gs = {};
  sheet.names = new Map();
  sheet.clearTag();
  rehydrateSheet(sheet);
};

describe('rehydration', () => {
  /**
   * Make sure the setup is the same for every test
   */
  beforeEach(() => {
    styled = resetStyled();
  });

  describe('with existing styled components', () => {
    beforeEach(() => {
      document.head.innerHTML = `
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          .b { color: red; }
          ${SC_ATTR}.g1[id="TWO"]{content: "b,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should preserve the styles', () => {
      expectCSSMatches('.b { color: red; }');
    });

    it('should append a new component like normal', () => {
      const Comp = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
        ${() => ''}
      `;
      TestRenderer.create(<Comp />);
      expectCSSMatches('.b { color: red; } .a { color:blue; }');
    });

    it('should reuse a componentId', () => {
      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
        ${() => ''}
      `;
      TestRenderer.create(<A />);
      const B = styled.div.withConfig({ componentId: 'TWO' })``;
      TestRenderer.create(<B />);
      expectCSSMatches('.b { color: red; } .a { color:blue; }');
    });

    it('should reuse a componentId and generated class', () => {
      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
        ${() => ''}
      `;
      TestRenderer.create(<A />);
      const B = styled.div.withConfig({ componentId: 'TWO' })`
        color: red;
        ${() => ''}
      `;
      TestRenderer.create(<B />);
      expectCSSMatches('.b { color: red; } .a { color:blue; }');
    });

    it('should reuse a componentId and inject new classes', () => {
      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
        ${() => ''}
      `;
      TestRenderer.create(<A />);
      const B = styled.div.withConfig({ componentId: 'TWO' })`
        color: ${() => 'red'};
      `;
      TestRenderer.create(<B />);
      const C = styled.div.withConfig({ componentId: 'TWO' })`
        color: ${() => 'green'};
      `;
      TestRenderer.create(<C />);
      expectCSSMatches('.b{ color: red; } .c{ color:green; } .a{ color:blue; }');
    });
  });

  describe('with styled components with props', () => {
    beforeEach(() => {
      /* Hash 1323611362 is based on name TWO and contents color: red.
       * Change either and this will break. */
      document.head.innerHTML = `
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          .a { color: blue; }
          ${SC_ATTR}.g1[id="ONE"]{content: "a,"}
          .b { color: red; }
          ${SC_ATTR}.g2[id="TWO"]{content: "b,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should preserve the styles', () => {
      expectCSSMatches(`
        .a { color: blue; }
        .b { color: red; }
      `);
    });

    it('should not inject new styles for a component already rendered', () => {
      const Comp = styled.div.withConfig({ componentId: 'ONE' })`
        color: ${props => props.color};
      `;
      TestRenderer.create(<Comp color="blue" />);
      expectCSSMatches(`
        .a { color: blue; }
        .b { color: red; }
      `);
    });

    it('should inject new styles for a new computed style of a component', () => {
      seedNextClassnames(['x']);
      const Comp = styled.div.withConfig({ componentId: 'ONE' })`
        color: ${props => props.color};
      `;
      TestRenderer.create(<Comp color="green" />);
      expectCSSMatches(`
        .a { color: blue; } .x { color:green; }
        .b { color: red; }
      `);
    });
  });

  describe('with inline styles that werent rendered by us', () => {
    beforeEach(() => {
      /* Same css as before, but without the data attributes we ignore it */
      document.head.innerHTML = `
        <style>
          .b { color: red; }
          ${SC_ATTR}.g2[id="TWO"]{content: "b,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should leave the existing styles there', () => {
      expectCSSMatches('.b { color: red; } data-styled.g2[id="TWO"]{content:"b,"}');
    });
  });

  describe('with global styles', () => {
    beforeEach(() => {
      /* Adding a non-local stylesheet with a hash 557410406 which is
       * derived from "body { background: papayawhip; }" so be careful
       * changing it. */
      document.head.innerHTML = `
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          body { background: papayawhip; }
          ${SC_ATTR}.g1[id="sc-global-557410406"]{content: "sc-global-557410406,"}
        </style>
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          .a { color: red; }
          ${SC_ATTR}.g2[id="TWO"]{content: "a,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should leave the existing styles there', () => {
      expectCSSMatches('body { background: papayawhip; } .a { color: red; }');
    });

    it('should inject new global styles at the end', () => {
      const Component = createGlobalStyle`
        body { color: tomato; }
      `;
      TestRenderer.create(<Component />);
      expectCSSMatches(
        'body { background: papayawhip; } .a { color: red; } body { color:tomato; }'
      );
    });

    it('should interleave global and local styles', () => {
      const Component = createGlobalStyle`
        body { color: tomato; }
      `;

      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
        ${() => ''}
      `;

      TestRenderer.create(<Component />);
      TestRenderer.create(<A />);

      // although `<Component />` is rendered before `<A />`, the global style isn't registered until render time
      // compared to typical component styles which are registered at creation time
      expectCSSMatches(
        'body { background: papayawhip; } .a { color: red; } .b { color:blue; } body { color:tomato; }'
      );
    });
  });

  describe('with all styles already rendered', () => {
    beforeEach(() => {
      document.head.innerHTML = `
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          html { font-size: 16px; }
          ${SC_ATTR}.g1[id="sc-global-a1"]{content: "sc-global-a1,"}
          body { background: papayawhip; }
          ${SC_ATTR}.g2[id="sc-global-b1"]{content: "sc-global-b1,"}
          .c { color: blue; }
          ${SC_ATTR}.g3[id="ONE"]{content: "c,"}
          .d { color: red; }
          ${SC_ATTR}.g4[id="TWO"]{content: "d,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should not touch existing styles', () => {
      expectCSSMatches(`
        html { font-size: 16px; }
        body { background: papayawhip; }
        .c { color: blue; }
        .d { color: red; }
      `);
    });

    it('should not change styles if rendered in the same order they were created with', () => {
      const Component1 = createGlobalStyle`
        html { font-size: 16px; }
      `;
      TestRenderer.create(<Component1 />);
      const Component2 = createGlobalStyle`
        body { background: papayawhip; }
      `;
      TestRenderer.create(<Component2 />);
      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
      `;
      TestRenderer.create(<A />);
      const B = styled.div.withConfig({ componentId: 'TWO' })`
        color: red;
      `;
      TestRenderer.create(<B />);

      expectCSSMatches(`
        html { font-size: 16px; }
        body { background: papayawhip; }
        .c { color: blue; }
        .d { color: red; }
      `);
    });

    it('should still not change styles if rendered in a different order', () => {
      seedNextClassnames(['d', 'a', 'b', 'c']);

      const B = styled.div.withConfig({ componentId: 'TWO' })`
        color: red;
      `;
      TestRenderer.create(<B />);
      const Component1 = createGlobalStyle`
        html { font-size: 16px; }
      `;
      TestRenderer.create(<Component1 />);
      const Component2 = createGlobalStyle`
        body { background: papayawhip; }
      `;
      TestRenderer.create(<Component2 />);
      const A = styled.div.withConfig({ componentId: 'ONE' })`
        color: blue;
      `;
      TestRenderer.create(<A />);

      expectCSSMatches(`
        html { font-size: 16px; }
        body { background: papayawhip; }
        .c { color: blue; }
        .d { color: red; }
      `);
    });
  });

  describe('with keyframes', () => {
    beforeEach(() => {
      document.head.innerHTML = `
        <style ${SC_ATTR} ${SC_ATTR_VERSION}="${__VERSION__}">
          @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
          ${SC_ATTR}.g1[id="sc-keyframes-keyframe_880"]{content: "keyframe_880,"}
        </style>
      `;

      resetSheet(masterSheet);
    });

    it('should not touch existing styles', () => {
      expectCSSMatches(`
        @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
      `);
    });

    it('should not regenerate keyframes', () => {
      seedNextClassnames(['keyframe_880']);

      const fadeIn = keyframes`
        from { opacity: 0; }
      `;

      const A = styled.div`
        animation: ${fadeIn} 1s both;
        ${() => ''}
      `;

      TestRenderer.create(<A />);

      expectCSSMatches(`
        @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
        .b{ -webkit-animation:keyframe_880 1s both; animation:keyframe_880 1s both; }
      `);
    });

    it('should still inject new keyframes', () => {
      seedNextClassnames(['keyframe_144']);

      const fadeOut = keyframes`
        from { opacity: 1; }
      `;

      const A = styled.div`
        animation: ${fadeOut} 1s both;
        ${() => ''}
      `;

      TestRenderer.create(<A />);

      expectCSSMatches(`
        @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
        .b{ -webkit-animation:keyframe_144 1s both; animation:keyframe_144 1s both; }
        @-webkit-keyframes keyframe_144 {from {opacity:1;}}@keyframes keyframe_144 {from {opacity:1;}}
      `);
    });

    it('should pass the keyframes name along as well', () => {
      seedNextClassnames(['keyframe_880', 'keyframe_144']);

      const fadeIn = keyframes`
        from { opacity: 0; }
      `;
      const fadeOut = keyframes`
        from { opacity: 1; }
      `;
      const A = styled.div`
        animation: ${fadeIn} 1s both;
        ${() => ''}
      `;
      const B = styled.div`
        animation: ${fadeOut} 1s both;
        ${() => ''}
      `;
      /* Purposely rendering out of order to make sure the output looks right */
      TestRenderer.create(<B />);
      TestRenderer.create(<A />);

      expectCSSMatches(`
        @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
        .d { -webkit-animation:keyframe_880 1s both; animation:keyframe_880 1s both; }
        .c { -webkit-animation:keyframe_144 1s both; animation:keyframe_144 1s both; }
        @-webkit-keyframes keyframe_144 {from {opacity:1;}}@keyframes keyframe_144 {from {opacity:1;}}
      `);
    });

    it('should pass the keyframes name through props along as well', () => {
      seedNextClassnames(['keyframe_880', 'keyframe_144']);

      const fadeIn = keyframes`
        from { opacity: 0; }
      `;
      const fadeOut = keyframes`
        from { opacity: 1; }
      `;
      const A = styled.div`
        animation: ${props => props.animation} 1s both;
      `;
      const B = styled.div`
        animation: ${props => props.animation} 1s both;
      `;
      /* Purposely rendering out of order to make sure the output looks right */
      TestRenderer.create(<B animation={fadeOut} />);
      TestRenderer.create(<A animation={fadeIn} />);

      expectCSSMatches(`
        @-webkit-keyframes keyframe_880 {from {opacity: 0;}}@keyframes keyframe_880 {from {opacity: 0;}}
        .d { -webkit-animation:keyframe_880 1s both; animation:keyframe_880 1s both; }
        .c { -webkit-animation:keyframe_144 1s both; animation:keyframe_144 1s both; }
        @-webkit-keyframes keyframe_144 {from {opacity:1;}}@keyframes keyframe_144 {from {opacity:1;}}
      `);
    });
  });
});
