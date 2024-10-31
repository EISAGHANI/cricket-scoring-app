package com.cricket_scoring_app.controller;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;

@RestController  // Add this annotation
public class TestController {
    @GetMapping("/test")
    public String test() {
        return "test"; 
    }

    @GetMapping("/")
    public String home() {
        return "Welcome to Cricket Scoring App"; 
    }   
}