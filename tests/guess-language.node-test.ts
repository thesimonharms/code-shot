/**
 * Unit tests for guessLanguage() using Node's test runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { guessLanguage } from '../dist/parse.js';

void describe('guessLanguage', () => {
  void it('detects python from shebang', () => {
    assert.equal(guessLanguage('#!/usr/bin/env python3\nprint("hello")'), 'python');
    assert.equal(guessLanguage('#!/usr/bin/python\nprint("hello")'), 'python');
  });

  void it('detects bash from shebang', () => {
    assert.equal(guessLanguage('#!/bin/bash\necho hello'), 'bash');
    assert.equal(guessLanguage('#!/bin/sh\necho hello'), 'bash');
  });

  void it('detects node/deno from shebang', () => {
    assert.equal(guessLanguage('#!/usr/bin/env node\nconsole.log("hi")'), 'javascript');
    assert.equal(guessLanguage('#!/usr/bin/env deno\nconsole.log("hi")'), 'typescript');
  });

  void it('detects ruby from shebang', () => {
    assert.equal(guessLanguage('#!/usr/bin/env ruby\nputs "hello"'), 'ruby');
  });

  void it('detects perl from shebang', () => {
    assert.equal(guessLanguage('#!/usr/bin/perl\nprint "hello";'), 'perl');
  });

  void it('detects TypeScript from import/interface/type annotations', () => {
    assert.equal(guessLanguage('import { foo } from "bar";\nconst x: number = 5;'), 'typescript');
    assert.equal(guessLanguage('interface Foo { bar: string }'), 'typescript');
    assert.equal(guessLanguage('type Foo = { bar: string }'), 'typescript');
    assert.equal(guessLanguage('const x: number = 5;'), 'typescript');
    assert.equal(guessLanguage('import type { ReactNode } from "react";'), 'typescript');
  });

  void it('detects JavaScript from require/export default', () => {
    assert.equal(guessLanguage('const x = require("fs");'), 'javascript');
    assert.equal(guessLanguage('export default function() {}'), 'javascript');
  });

  void it('detects Rust from fn/let mut/use std', () => {
    assert.equal(guessLanguage('fn main() {\n  println!("hi");\n}'), 'rust');
    assert.equal(guessLanguage('let mut x = 5;'), 'rust');
    assert.equal(guessLanguage('use std::io;'), 'rust');
    assert.equal(guessLanguage('impl Display for Foo {}'), 'rust');
  });

  void it('detects Go from func/package', () => {
    assert.equal(guessLanguage('package main'), 'go');
    assert.equal(guessLanguage('func main() {}'), 'go');
    assert.equal(guessLanguage('import (\n\t"fmt"\n)'), 'go');
  });

  void it('detects Python from def/import/from import', () => {
    assert.equal(guessLanguage('def hello():\n    pass'), 'python');
    assert.equal(guessLanguage('import os'), 'python');
    assert.equal(guessLanguage('from typing import List'), 'python');
  });

  void it('detects Java from class/public/private', () => {
    assert.equal(guessLanguage('public class Hello {}'), 'java');
    assert.equal(guessLanguage('private final int x = 5;'), 'java');
    assert.equal(guessLanguage('void hello() {}'), 'java');
  });

  void it('detects C from #include/#define', () => {
    assert.equal(guessLanguage('#include <stdio.h>'), 'c');
    assert.equal(guessLanguage('#define MAX 100'), 'c');
  });

  void it('detects Kotlin from fun/module', () => {
    assert.equal(guessLanguage('fun main() {}'), 'kotlin');
    assert.equal(guessLanguage('val x = 5'), 'kotlin');
    assert.equal(guessLanguage('open class Foo {}'), 'kotlin');
  });

  void it('detects HTML from template/DOCTYPE', () => {
    assert.equal(guessLanguage('<!DOCTYPE html>'), 'html');
    assert.equal(guessLanguage('<html lang="en">'), 'html');
    assert.equal(guessLanguage('<template>\n  <div>test</div>\n</template>'), 'html');
  });

  void it('detects JSON from dependencies pattern', () => {
    assert.equal(guessLanguage('{\n  "dependencies": {}\n}'), 'json');
    assert.equal(guessLanguage('{\n  "scripts": {}\n}'), 'json');
  });

  void it('falls back to text for unknown code', () => {
    assert.equal(guessLanguage('some random text without any keywords or shebangs'), 'text');
  });

  void it('handles empty string', () => {
    assert.equal(guessLanguage(''), 'text');
  });

  void it('handles code with only whitespace', () => {
    assert.equal(guessLanguage('   \n  \n'), 'text');
  });
});
