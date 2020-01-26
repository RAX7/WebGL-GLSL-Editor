import { CompletionItemProvider, TextDocument, Position, CancellationToken, CompletionContext, ProviderResult, CompletionItem, CompletionList, CompletionItemKind, CompletionItemTag, MarkdownString } from 'vscode';
import { GlslProcessor } from '../core/glsl-processor';
import { GlslDocumentInfo } from '../core/glsl-document-info';
import { LogicalFunction } from '../scope/function/logical-function';
import { Scope } from '../scope/scope';
import { TypeCategory } from '../scope/type/type-category';
import { Helper } from '../helper/helper';
import { ShaderStage } from '../core/shader-stage';

export class GlslCompletionProvider implements CompletionItemProvider {

    private di: GlslDocumentInfo;
    private document: TextDocument;
    private position: Position;
    private offset: number;
    private items: Array<CompletionItem>;

    //TODO:
    //online dokumentáció bevarázslása
    //kontextusfüggő ajánlás
    //például függvényen kívül ne ajánljunk függvényeket, úgyse tudjuk meghívni stb.
    //de legalább annyit, hogy a struct-ok memberjeit és a swizzle-ket elérjük

    private importantElements = ['cross', 'distance', 'dot', 'inverse', 'length', 'normalize', 'reflect', 'refract', 'texture', 'transpose', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4'];

    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[] | CompletionList> {
        this.initialize(document, position);
        this.items = new Array<CompletionItem>();
        this.addFunctionCompletionItems();
        this.addKeywordCompletionItems();
        this.addQualifierCompletionItems();
        this.addTypeCompletionItems();
        this.addVariableCompletionItems();
        return this.items;
    }

    private initialize(document: TextDocument, position: Position): void {
        GlslProcessor.processDocument(document);
        this.di = GlslProcessor.getDocumentInfo(document.uri);
        this.document = document;
        this.position = position;
        this.offset = document.offsetAt(position);
    }

    private isAvailable(stage: ShaderStage): boolean {
        return stage === ShaderStage.DEFAULT || stage === this.di.getShaderStage();
    }

    //
    //function
    //
    private addFunctionCompletionItems(): void {
        for (const lf of this.di.functions) {
            const ci = this.getFunctionCompletionItem(lf);
            if (ci) {
                this.items.push(ci);
            }
        }
        for (const func of this.di.builtin.functionSummaries.values()) {
            if (this.isAvailable(func.stage)) {
                const kind = func.ctor ? CompletionItemKind.Constructor : CompletionItemKind.Function;
                const ci = new CompletionItem(func.name, kind);
                if (this.importantElements.includes(ci.label)) {
                    ci.insertText = ci.label;
                    ci.filterText = ci.label;
                    ci.sortText = '*' + ci.label;
                    ci.label = '★ ' + ci.label;
                }
                ci.detail = func.ctor ? null : 'Built-In Function';
                ci.documentation = func.summary;
                this.items.push(ci);
            }
        }
    }

    private getFunctionCompletionItem(lf: LogicalFunction): CompletionItem {
        for (const fd of lf.definitions) {
            if (this.offset > fd.interval.stopIndex) {
                const ci = new CompletionItem(fd.name, CompletionItemKind.Function);
                ci.documentation = new MarkdownString(fd.toStringDocumentation());
                return ci;
            }
        }
        for (const fp of lf.prototypes) {
            if (this.offset > fp.interval.stopIndex) {
                const ci = new CompletionItem(fp.name, CompletionItemKind.Function);
                return ci;
            }
        }
        return null;
    }

    //
    //keyword
    //
    private addKeywordCompletionItems(): void {
        for (const kw of this.di.builtin.keywords) {
            const ci = new CompletionItem(kw.name, CompletionItemKind.Keyword);
            this.items.push(ci);
        }
    }

    //
    //qualifier
    //
    private addQualifierCompletionItems(): void {
        for (const q of this.di.builtin.qualifiers.values()) {
            const ci = new CompletionItem(q.name, CompletionItemKind.Keyword);
            this.items.push(ci);
        }
    }

    //
    //type
    //
    private addTypeCompletionItems(): void {
        this.addUserTypeCompletionItems(this.di.getRootScope());
        for (const td of this.di.builtin.types.values()) {
            const ci = new CompletionItem(td.name, CompletionItemKind.Class);
            if (td.typeCategory === TypeCategory.CUSTOM) {
                ci.documentation = new MarkdownString(td.toStringDocumentation());
                ci.detail = 'Built-In Type';
            }
            this.items.push(ci);
        }
    }

    private addUserTypeCompletionItems(scope: Scope): void {
        if (scope && (Helper.intervalToRange(scope.interval, this.document).contains(this.position) || scope.parent === null)) {
            for (const td of scope.typeDeclarations) {
                if (this.offset > td.structInterval.stopIndex) {
                    const ci = new CompletionItem(td.name, CompletionItemKind.Struct);
                    ci.documentation = new MarkdownString(td.toStringDocumentation());
                    ci.detail = 'Type';
                    this.items.push(ci);
                }
            }
            for (const childScope of scope.children) {
                this.addUserTypeCompletionItems(childScope);
            }
        }
    }

    //
    //variable
    //
    private addVariableCompletionItems(): void {
        this.addUserVariableCompletionItems(this.di.getRootScope());
        for (const vd of this.di.builtin.variables.values()) {
            if (this.isAvailable(vd.stage)) {
                const ci = new CompletionItem(vd.name, CompletionItemKind.Variable);
                ci.documentation = vd.summary;
                ci.detail = 'Built-In Variable';
                this.items.push(ci);
            }
        }
    }

    private addUserVariableCompletionItems(scope: Scope): void {
        if (scope && (Helper.intervalToRange(scope.interval, this.document).contains(this.position) || scope.parent === null)) {
            for (const vd of scope.variableDeclarations) {
                if (this.offset > vd.declarationInterval.stopIndex) {
                    const ci = new CompletionItem(vd.name, CompletionItemKind.Variable);
                    ci.documentation = new MarkdownString(vd.toStringDocumentation());
                    ci.detail = 'Variable';
                    this.items.push(ci);
                }
            }
            for (const childScope of scope.children) {
                this.addUserVariableCompletionItems(childScope);
            }
        }
    }

}