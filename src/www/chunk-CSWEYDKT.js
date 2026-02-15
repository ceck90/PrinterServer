import{a as de,e as se,s as le}from"./chunk-HE46RGHK.js";import{a as ae}from"./chunk-TQJZDK7J.js";import{$ as M,A as u,Ac as oe,Bc as B,E as d,Fc as te,G as _,Gc as ie,Ha as P,Ic as x,Jc as ce,Ka as K,Kc as re,O as v,P as Q,R as C,S as $,T as b,V,Wa as X,Za as N,_ as c,aa as T,ba as y,bb as k,cb as U,ea as j,eb as Z,fa as E,ga as S,gb as J,ia as H,ib as W,ka as R,l as z,la as l,lb as Y,m as D,n as A,nc as ee,o as O,oa as F,oc as ne,pa as q,q as m,qa as I,ra as w,s as f,t as g,u as p,y as L,ya as G,za as s}from"./chunk-EAKF4ZFQ.js";var me=["data-p-icon","minus"],he=(()=>{class e extends re{static \u0275fac=(()=>{let o;return function(n){return(o||(o=u(e)))(n||e)}})();static \u0275cmp=v({type:e,selectors:[["","data-p-icon","minus"]],features:[C],attrs:me,decls:1,vars:0,consts:[["d","M13.2222 7.77778H0.777778C0.571498 7.77778 0.373667 7.69584 0.227806 7.54998C0.0819442 7.40412 0 7.20629 0 7.00001C0 6.79373 0.0819442 6.5959 0.227806 6.45003C0.373667 6.30417 0.571498 6.22223 0.777778 6.22223H13.2222C13.4285 6.22223 13.6263 6.30417 13.7722 6.45003C13.9181 6.5959 14 6.79373 14 7.00001C14 7.20629 13.9181 7.40412 13.7722 7.54998C13.6263 7.69584 13.4285 7.77778 13.2222 7.77778Z","fill","currentColor"]],template:function(t,n){t&1&&(p(),j(0,"path",0))},encapsulation:2})}return e})();var pe=`
    .p-checkbox {
        position: relative;
        display: inline-flex;
        user-select: none;
        vertical-align: bottom;
        width: dt('checkbox.width');
        height: dt('checkbox.height');
    }

    .p-checkbox-input {
        cursor: pointer;
        appearance: none;
        position: absolute;
        inset-block-start: 0;
        inset-inline-start: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        margin: 0;
        opacity: 0;
        z-index: 1;
        outline: 0 none;
        border: 1px solid transparent;
        border-radius: dt('checkbox.border.radius');
    }

    .p-checkbox-box {
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: dt('checkbox.border.radius');
        border: 1px solid dt('checkbox.border.color');
        background: dt('checkbox.background');
        width: dt('checkbox.width');
        height: dt('checkbox.height');
        transition:
            background dt('checkbox.transition.duration'),
            color dt('checkbox.transition.duration'),
            border-color dt('checkbox.transition.duration'),
            box-shadow dt('checkbox.transition.duration'),
            outline-color dt('checkbox.transition.duration');
        outline-color: transparent;
        box-shadow: dt('checkbox.shadow');
    }

    .p-checkbox-icon {
        transition-duration: dt('checkbox.transition.duration');
        color: dt('checkbox.icon.color');
        font-size: dt('checkbox.icon.size');
        width: dt('checkbox.icon.size');
        height: dt('checkbox.icon.size');
    }

    .p-checkbox:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        border-color: dt('checkbox.hover.border.color');
    }

    .p-checkbox-checked .p-checkbox-box {
        border-color: dt('checkbox.checked.border.color');
        background: dt('checkbox.checked.background');
    }

    .p-checkbox-checked .p-checkbox-icon {
        color: dt('checkbox.icon.checked.color');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        background: dt('checkbox.checked.hover.background');
        border-color: dt('checkbox.checked.hover.border.color');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-icon {
        color: dt('checkbox.icon.checked.hover.color');
    }

    .p-checkbox:not(.p-disabled):has(.p-checkbox-input:focus-visible) .p-checkbox-box {
        border-color: dt('checkbox.focus.border.color');
        box-shadow: dt('checkbox.focus.ring.shadow');
        outline: dt('checkbox.focus.ring.width') dt('checkbox.focus.ring.style') dt('checkbox.focus.ring.color');
        outline-offset: dt('checkbox.focus.ring.offset');
    }

    .p-checkbox-checked:not(.p-disabled):has(.p-checkbox-input:focus-visible) .p-checkbox-box {
        border-color: dt('checkbox.checked.focus.border.color');
    }

    .p-checkbox.p-invalid > .p-checkbox-box {
        border-color: dt('checkbox.invalid.border.color');
    }

    .p-checkbox.p-variant-filled .p-checkbox-box {
        background: dt('checkbox.filled.background');
    }

    .p-checkbox-checked.p-variant-filled .p-checkbox-box {
        background: dt('checkbox.checked.background');
    }

    .p-checkbox-checked.p-variant-filled:not(.p-disabled):has(.p-checkbox-input:hover) .p-checkbox-box {
        background: dt('checkbox.checked.hover.background');
    }

    .p-checkbox.p-disabled {
        opacity: 1;
    }

    .p-checkbox.p-disabled .p-checkbox-box {
        background: dt('checkbox.disabled.background');
        border-color: dt('checkbox.checked.disabled.border.color');
    }

    .p-checkbox.p-disabled .p-checkbox-box .p-checkbox-icon {
        color: dt('checkbox.icon.disabled.color');
    }

    .p-checkbox-sm,
    .p-checkbox-sm .p-checkbox-box {
        width: dt('checkbox.sm.width');
        height: dt('checkbox.sm.height');
    }

    .p-checkbox-sm .p-checkbox-icon {
        font-size: dt('checkbox.icon.sm.size');
        width: dt('checkbox.icon.sm.size');
        height: dt('checkbox.icon.sm.size');
    }

    .p-checkbox-lg,
    .p-checkbox-lg .p-checkbox-box {
        width: dt('checkbox.lg.width');
        height: dt('checkbox.lg.height');
    }

    .p-checkbox-lg .p-checkbox-icon {
        font-size: dt('checkbox.icon.lg.size');
        width: dt('checkbox.icon.lg.size');
        height: dt('checkbox.icon.lg.size');
    }
`;var fe=["icon"],ge=["input"],_e=(e,a)=>({checked:e,class:a});function ve(e,a){if(e&1&&y(0,"span",8),e&2){let o=l(3);s(o.cx("icon")),c("ngClass",o.checkboxIcon)("pBind",o.ptm("icon"))}}function Ce(e,a){if(e&1&&(p(),y(0,"svg",9)),e&2){let o=l(3);s(o.cx("icon")),c("pBind",o.ptm("icon"))}}function ye(e,a){if(e&1&&(E(0),b(1,ve,1,4,"span",6)(2,Ce,1,3,"svg",7),S()),e&2){let o=l(2);d(),c("ngIf",o.checkboxIcon),d(),c("ngIf",!o.checkboxIcon)}}function Ie(e,a){if(e&1&&(p(),y(0,"svg",10)),e&2){let o=l(2);s(o.cx("icon")),c("pBind",o.ptm("icon"))}}function we(e,a){if(e&1&&(E(0),b(1,ye,3,2,"ng-container",3)(2,Ie,1,3,"svg",5),S()),e&2){let o=l();d(),c("ngIf",o.checked),d(),c("ngIf",o._indeterminate())}}function Be(e,a){}function Ve(e,a){e&1&&b(0,Be,0,0,"ng-template")}var Me=`
    ${pe}

    /* For PrimeNG */
    p-checkBox.ng-invalid.ng-dirty .p-checkbox-box,
    p-check-box.ng-invalid.ng-dirty .p-checkbox-box,
    p-checkbox.ng-invalid.ng-dirty .p-checkbox-box {
        border-color: dt('checkbox.invalid.border.color');
    }
`,Te={root:({instance:e})=>["p-checkbox p-component",{"p-checkbox-checked p-highlight":e.checked,"p-disabled":e.$disabled(),"p-invalid":e.invalid(),"p-variant-filled":e.$variant()==="filled","p-checkbox-sm p-inputfield-sm":e.size()==="small","p-checkbox-lg p-inputfield-lg":e.size()==="large"}],box:"p-checkbox-box",input:"p-checkbox-input",icon:"p-checkbox-icon"},ue=(()=>{class e extends te{name="checkbox";style=Me;classes=Te;static \u0275fac=(()=>{let o;return function(n){return(o||(o=u(e)))(n||e)}})();static \u0275prov=D({token:e,factory:e.\u0275fac})}return e})();var be=new O("CHECKBOX_INSTANCE"),Ee={provide:de,useExisting:z(()=>ke),multi:!0},ke=(()=>{class e extends le{hostName="";value;binary;ariaLabelledBy;ariaLabel;tabindex;inputId;inputStyle;styleClass;inputClass;indeterminate=!1;formControl;checkboxIcon;readonly;autofocus;trueValue=!0;falseValue=!1;variant=N();size=N();onChange=new _;onFocus=new _;onBlur=new _;inputViewChild;get checked(){return this._indeterminate()?!1:this.binary?this.modelValue()===this.trueValue:ne(this.value,this.modelValue())}_indeterminate=L(void 0);checkboxIconTemplate;templates;_checkboxIconTemplate;focused=!1;_componentStyle=m(ue);bindDirectiveInstance=m(x,{self:!0});$pcCheckbox=m(be,{optional:!0,skipSelf:!0})??void 0;$variant=X(()=>this.variant()||this.config.inputStyle()||this.config.inputVariant());onAfterContentInit(){this.templates?.forEach(o=>{switch(o.getType()){case"icon":this._checkboxIconTemplate=o.template;break;case"checkboxicon":this._checkboxIconTemplate=o.template;break}})}onChanges(o){o.indeterminate&&this._indeterminate.set(o.indeterminate.currentValue)}onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptms(["host","root"]))}updateModel(o){let t,n=this.injector.get(se,null,{optional:!0,self:!0}),i=n&&!this.formControl?n.value:this.modelValue();this.binary?(t=this._indeterminate()?this.trueValue:this.checked?this.falseValue:this.trueValue,this.writeModelValue(t),this.onModelChange(t)):(this.checked||this._indeterminate()?t=i.filter(r=>!ee(r,this.value)):t=i?[...i,this.value]:[this.value],this.onModelChange(t),this.writeModelValue(t),this.formControl&&this.formControl.setValue(t)),this._indeterminate()&&this._indeterminate.set(!1),this.onChange.emit({checked:t,originalEvent:o})}handleChange(o){this.readonly||this.updateModel(o)}onInputFocus(o){this.focused=!0,this.onFocus.emit(o)}onInputBlur(o){this.focused=!1,this.onBlur.emit(o),this.onModelTouched()}focus(){this.inputViewChild?.nativeElement.focus()}writeControlValue(o,t){t(o),this.cd.markForCheck()}static \u0275fac=(()=>{let o;return function(n){return(o||(o=u(e)))(n||e)}})();static \u0275cmp=v({type:e,selectors:[["p-checkbox"],["p-checkBox"],["p-check-box"]],contentQueries:function(t,n,i){if(t&1&&(F(i,fe,4),F(i,oe,4)),t&2){let r;I(r=w())&&(n.checkboxIconTemplate=r.first),I(r=w())&&(n.templates=r)}},viewQuery:function(t,n){if(t&1&&q(ge,5),t&2){let i;I(i=w())&&(n.inputViewChild=i.first)}},hostVars:5,hostBindings:function(t,n){t&2&&(V("data-p-highlight",n.checked)("data-p-checked",n.checked)("data-p-disabled",n.$disabled()),s(n.cn(n.cx("root"),n.styleClass)))},inputs:{hostName:"hostName",value:"value",binary:[2,"binary","binary",k],ariaLabelledBy:"ariaLabelledBy",ariaLabel:"ariaLabel",tabindex:[2,"tabindex","tabindex",U],inputId:"inputId",inputStyle:"inputStyle",styleClass:"styleClass",inputClass:"inputClass",indeterminate:[2,"indeterminate","indeterminate",k],formControl:"formControl",checkboxIcon:"checkboxIcon",readonly:[2,"readonly","readonly",k],autofocus:[2,"autofocus","autofocus",k],trueValue:"trueValue",falseValue:"falseValue",variant:[1,"variant"],size:[1,"size"]},outputs:{onChange:"onChange",onFocus:"onFocus",onBlur:"onBlur"},features:[P([Ee,ue,{provide:be,useExisting:e},{provide:ie,useExisting:e}]),$([x]),C],decls:5,vars:24,consts:[["input",""],["type","checkbox",3,"focus","blur","change","checked","pBind"],[3,"pBind"],[4,"ngIf"],[4,"ngTemplateOutlet","ngTemplateOutletContext"],["data-p-icon","minus",3,"class","pBind",4,"ngIf"],[3,"class","ngClass","pBind",4,"ngIf"],["data-p-icon","check",3,"class","pBind",4,"ngIf"],[3,"ngClass","pBind"],["data-p-icon","check",3,"pBind"],["data-p-icon","minus",3,"pBind"]],template:function(t,n){if(t&1){let i=H();M(0,"input",1,0),R("focus",function(h){return f(i),g(n.onInputFocus(h))})("blur",function(h){return f(i),g(n.onInputBlur(h))})("change",function(h){return f(i),g(n.handleChange(h))}),T(),M(2,"div",2),b(3,we,3,2,"ng-container",3)(4,Ve,1,0,null,4),T()}t&2&&(G(n.inputStyle),s(n.cn(n.cx("input"),n.inputClass)),c("checked",n.checked)("pBind",n.ptm("input")),V("id",n.inputId)("value",n.value)("name",n.name())("tabindex",n.tabindex)("required",n.required()?"":void 0)("readonly",n.readonly?"":void 0)("disabled",n.$disabled()?"":void 0)("aria-labelledby",n.ariaLabelledBy)("aria-label",n.ariaLabel),d(2),s(n.cx("box")),c("pBind",n.ptm("box")),d(),c("ngIf",!n.checkboxIconTemplate&&!n._checkboxIconTemplate),d(),c("ngTemplateOutlet",n.checkboxIconTemplate||n._checkboxIconTemplate)("ngTemplateOutletContext",K(21,_e,n.checked,n.cx("icon"))))},dependencies:[Y,Z,J,W,B,ae,he,ce,x],encapsulation:2,changeDetection:0})}return e})(),cn=(()=>{class e{static \u0275fac=function(t){return new(t||e)};static \u0275mod=Q({type:e});static \u0275inj=A({imports:[ke,B,B]})}return e})();export{ke as a,cn as b};
