declare module 'compromise' {
    interface Term {
      text(): string;
    }
  
    interface Terms {
      out(format: string): string[];
    }
  
    interface Document {
      terms(): Terms;
      nouns(): Term[];
      verbs(): Term[];
      adjectives(): Term[];
    }
  
    function nlp(text: string): Document;
    
    export = nlp;
  }