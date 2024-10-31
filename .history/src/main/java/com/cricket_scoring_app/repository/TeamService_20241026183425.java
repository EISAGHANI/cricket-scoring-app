package com.cricket_scoring_app.repository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.cricket_scoring_app.entity.Team;


@Service
public class TeamService {
    @Autowired
    private TeamRepository TeamRepository;

    public Team createTeam(Team team) 
}
